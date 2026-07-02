import { spawnSync } from "node:child_process";
import process from "node:process";

import { loadScriptEnv } from "./lib/script-env.mjs";
import { DEFAULT_STAGE_PROOF_ENV_FILE, resolveNodeCommand } from "./lib/stage-live-proof.mjs";

const rawArgv = process.argv.slice(2);
const args = parseProofArgs(rawArgv);
const execute = hasFlag(rawArgv, "execute");
const explicitEnvFilePath = normalizeValue(args["env-file"] ?? process.env.WF_STAGE_ENV_FILE);
const envFilePath = explicitEnvFilePath ?? (execute ? DEFAULT_STAGE_PROOF_ENV_FILE : null);
const sourceEnv = {
  ...(envFilePath ? loadScriptEnv(envFilePath) : {}),
  ...process.env
};

const baseUrl = requireOrigin(args["base-url"] ?? sourceEnv.WF_LIVE_BASE_URL ?? sourceEnv.WF_STAGE_API_ORIGIN, "WF_STAGE_API_ORIGIN");
const portalOrigin = requireOrigin(args["portal-origin"] ?? sourceEnv.WF_STAGE_PORTAL_ORIGIN ?? sourceEnv.WF_SMOKE_PORTAL_URL, "WF_STAGE_PORTAL_ORIGIN");
const tenantId = normalizeValue(args.tenant ?? sourceEnv.WF_STAGE_PROOF_TENANT_ID);
const userId = normalizeValue(args.user ?? sourceEnv.WF_STAGE_PROOF_USER_ID);
const role = parseRole(args.role ?? sourceEnv.WF_STAGE_PROOF_ROLE);
const expiresInMinutes = parseExpiresInMinutes(args["expires-in-minutes"] ?? sourceEnv.WF_STAGE_PROOF_TOKEN_TTL_MINUTES);
const timeoutMs = parsePositiveInteger(args["timeout-ms"] ?? "15000", "timeout-ms");
const sessionCookieName = normalizeValue(args["session-cookie-name"] ?? sourceEnv.WF_PORTAL_SESSION_COOKIE_NAME) ?? "wf_portal_session";
const providedSessionToken =
  normalizeValue(args["session-token"]) ??
  normalizeValue(sourceEnv.WF_LIVE_SESSION_COOKIE_VALUE) ??
  normalizeValue(sourceEnv.WF_SMOKE_SESSION_COOKIE_VALUE);
const sessionTokenSource = providedSessionToken ? "provided" : "minted";

if (!execute) {
  process.stdout.write(
    `${JSON.stringify(
      {
        ok: true,
        dryRun: true,
        phase: "dashboard_result_approval_live_read_planned",
        apiOrigin: baseUrl,
        portalOrigin,
        envFilePath,
        sessionCookieName,
        sessionTokenSource,
        tenantId: tenantId ?? "<required-for-mint-session>",
        userId: userId ?? "<required-for-mint-session>",
        role,
        timeoutMs,
        request: {
          method: "GET",
          endpoint: `${baseUrl}/api/dashboard`,
          mutates: false
        },
        note: "DRY RUN: no network calls made. Pass --execute to run the read-only live dashboard result approval proof."
      },
      null,
      2
    )}\n`
  );
  process.exit(0);
}

const sessionTokenResolution = await resolveSessionToken({
  providedSessionToken,
  tenantId,
  userId,
  role,
  expiresInMinutes,
  env: sourceEnv
});
const response = await fetchWithTimeout(`${baseUrl}/api/dashboard`, {
  method: "GET",
  headers: {
    origin: portalOrigin,
    cookie: `${sessionCookieName}=${sessionTokenResolution.sessionToken}`
  }
}, timeoutMs);
const bodyText = await response.text();
const parsedBody = parseJson(bodyText);
const resultApprovalStates = parsedBody && typeof parsedBody === "object" ? parsedBody.resultApprovalStates : undefined;
const resultApprovalStateShapeOk =
  resultApprovalStates !== undefined &&
  resultApprovalStates !== null &&
  typeof resultApprovalStates === "object" &&
  !Array.isArray(resultApprovalStates);
const safeBody = sanitizeDashboardBody(parsedBody);
const ok = response.status === 200 && resultApprovalStateShapeOk && !containsForbiddenText(bodyText);

process.exitCode = ok ? 0 : 1;
process.stdout.write(
  `${JSON.stringify(
    {
      ok,
      dryRun: false,
      phase: ok ? "dashboard_result_approval_live_read_verified" : "dashboard_result_approval_live_read_failed",
      apiOrigin: baseUrl,
      portalOrigin,
      envFilePath,
      sessionCookieName,
      sessionTokenSource: sessionTokenResolution.source,
      tenantId: tenantId ?? null,
      userId: userId ?? null,
      role,
      response: {
        status: response.status,
        resultApprovalStatesPresent: resultApprovalStates !== undefined,
        resultApprovalStatesShape: resultApprovalStateShapeOk ? "object" : typeof resultApprovalStates,
        resultApprovalStateCount: resultApprovalStateShapeOk ? Object.keys(resultApprovalStates).length : 0,
        sanitizedBody: safeBody
      }
    },
    null,
    2
  )}\n`
);

async function resolveSessionToken({ providedSessionToken, tenantId, userId, role, expiresInMinutes, env }) {
  if (providedSessionToken) {
    return {
      source: "provided",
      sessionToken: providedSessionToken
    };
  }

  if (!tenantId || !userId) {
    throw new Error("--tenant and --user are required when no --session-token is supplied");
  }

  runCommand("npm run build:server", resolveNodeCommand("npm"), ["run", "build:server"], { env });
  const { createRuntimeSessionToken, loadRuntimeSessionAuthEnv } = await import("../dist/api/runtime-auth.js");
  const runtimeAuthEnv = loadRuntimeSessionAuthEnv(env);
  return {
    source: "minted",
    sessionToken: createRuntimeSessionToken({
      signingKey: runtimeAuthEnv.signingKey,
      issuer: runtimeAuthEnv.issuer,
      audience: runtimeAuthEnv.audience,
      session: {
        tenantId,
        userId,
        role
      },
      expiresAt: new Date(Date.now() + expiresInMinutes * 60_000)
    })
  };
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error(`Dashboard approval read proof timed out after ${timeoutMs}ms`)), timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }
}

function runCommand(label, command, commandArgs, options) {
  const result = spawnSync(command, commandArgs, {
    cwd: process.cwd(),
    shell: process.platform === "win32" && /\.cmd$/i.test(command),
    stdio: "inherit",
    ...options
  });
  if (typeof result.status === "number" && result.status !== 0) {
    process.exit(result.status);
  }
  if (result.error) {
    throw result.error;
  }
}

function parseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function sanitizeDashboardBody(value) {
  if (!value || typeof value !== "object") {
    return null;
  }
  return {
    resultApprovalStates: isPlainObject(value.resultApprovalStates) ? value.resultApprovalStates : null,
    artifacts: Array.isArray(value.artifacts) ? value.artifacts.map((artifact) => sanitizeRecord(artifact, ["id", "filename", "artifactType", "expiresAt"])) : [],
    workflows: Array.isArray(value.workflows) ? value.workflows.map((workflow) => sanitizeRecord(workflow, ["id", "name", "providerKind", "enabled", "startEnabled"])) : []
  };
}

function sanitizeRecord(value, allowedKeys) {
  if (!isPlainObject(value)) {
    return {};
  }
  return Object.fromEntries(
    allowedKeys
      .filter((key) => Object.hasOwn(value, key))
      .map((key) => [key, value[key]])
  );
}

function containsForbiddenText(value) {
  return /paperclip|prompt|skill|command|tool call|raw activity|internal log|service token|vault:\/\/|wf_secret_|access_token=|api[_-]?key[:=]|authorization[:=]|Bearer\s+|sk-[A-Za-z0-9_-]+|pc-(company|run|agent|goal|task)-/i.test(value);
}

function hasFlag(argv, flag) {
  return argv.includes(`--${flag}`);
}

function parseProofArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith("--")) {
      continue;
    }

    const key = value.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      args[key] = "true";
      continue;
    }

    args[key] = next;
    index += 1;
  }
  return args;
}

function requireOrigin(value, name) {
  const normalized = normalizeValue(value);
  if (!normalized) {
    throw new Error(`${name} is required`);
  }
  return normalized.replace(/\/$/, "");
}

function normalizeValue(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function parseRole(value) {
  const normalized = normalizeValue(value) ?? "member";
  if (normalized !== "member" && normalized !== "operator") {
    throw new Error("--role must be member or operator");
  }
  return normalized;
}

function parseExpiresInMinutes(value) {
  const normalized = normalizeValue(value);
  if (!normalized) {
    return 15;
  }
  const parsed = Number(normalized);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 60) {
    throw new Error("--expires-in-minutes must be an integer between 1 and 60");
  }
  return parsed;
}

function parsePositiveInteger(value, label) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`--${label} must be a positive integer`);
  }
  return parsed;
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
