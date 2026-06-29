import { spawnSync } from "node:child_process";
import process from "node:process";

import { proveLiveAttentionCycleRefresh } from "./lib/live-attention-cycle-proof.mjs";
import { DEFAULT_STAGE_PROOF_ENV_FILE, DEFAULT_STAGE_SSH_ENV_FILE, parseStageProofArgs, resolveNodeCommand } from "./lib/stage-live-proof.mjs";
import { loadScriptEnv } from "./lib/script-env.mjs";

const args = parseStageProofArgs(process.argv.slice(2));
const seedEnvFilePath = normalizeValue(args["env-file"] ?? process.env.WF_STAGE_ENV_FILE) ?? DEFAULT_STAGE_PROOF_ENV_FILE;
const sshEnvFilePath = normalizeValue(args["ssh-env-file"] ?? process.env.WF_STAGE_SSH_ENV_FILE) ?? DEFAULT_STAGE_SSH_ENV_FILE;
const source = {
  ...loadScriptEnv(sshEnvFilePath),
  ...loadScriptEnv(seedEnvFilePath)
};
const env = {
  ...process.env,
  ...source
};

const tenantId = requireArg(args, "tenant");
const userId = requireArg(args, "user");
const workflowId = normalizeValue(args["workflow"] ?? env.WF_STAGE_ATTENTION_CYCLE_WORKFLOW_ID) ?? "wf_connect_first_workflow";
const role = parseRole(args.role ?? env.WF_STAGE_PROOF_ROLE);
const expiresInMinutes = parseExpiresInMinutes(args["expires-in-minutes"] ?? env.WF_STAGE_PROOF_TOKEN_TTL_MINUTES);
const sessionCookieName = normalizeValue(args["session-cookie-name"] ?? env.WF_PORTAL_SESSION_COOKIE_NAME) ?? "wf_portal_session";
const baseUrl = requireOrigin(args["base-url"] ?? env.WF_LIVE_BASE_URL ?? env.WF_STAGE_API_ORIGIN, "WF_LIVE_BASE_URL");
const portalOrigin = requireOrigin(args["portal-origin"] ?? env.WF_SMOKE_PORTAL_URL ?? env.WF_STAGE_PORTAL_ORIGIN, "WF_SMOKE_PORTAL_URL");
const providedSessionToken =
  normalizeValue(args["session-token"]) ??
  normalizeValue(env.WF_LIVE_SESSION_COOKIE_VALUE) ??
  normalizeValue(env.WF_SMOKE_SESSION_COOKIE_VALUE);
const persona = normalizeValue(args.persona ?? env.WF_STAGE_ATTENTION_CYCLE_PERSONA) ?? "cfo";
const title =
  normalizeValue(args.title ?? env.WF_STAGE_ATTENTION_CYCLE_TITLE) ??
  `Stage attention-cycle proof ${new Date().toISOString()}`;
const deliverableType = normalizeValue(args["deliverable-type"] ?? env.WF_STAGE_ATTENTION_CYCLE_DELIVERABLE_TYPE) ?? "pricing_review";
const firstBlockSummary =
  normalizeValue(args["first-block-summary"] ?? env.WF_STAGE_ATTENTION_CYCLE_FIRST_BLOCK_SUMMARY) ??
  "Lane is blocked pending an explicit board unblock decision.";
const secondBlockSummary =
  normalizeValue(args["second-block-summary"] ?? env.WF_STAGE_ATTENTION_CYCLE_SECOND_BLOCK_SUMMARY) ??
  "Lane re-entered a new blocked cycle after additional bounded follow-up.";
const unblockSummary =
  normalizeValue(args["unblock-summary"] ?? env.WF_STAGE_ATTENTION_CYCLE_UNBLOCK_SUMMARY) ??
  "The board supplied the missing bounded unblock context.";

const sessionTokenResolution = await resolveSessionToken({
  providedSessionToken,
  tenantId,
  userId,
  role,
  expiresInMinutes,
  env
});

const result = await proveLiveAttentionCycleRefresh({
  baseUrl,
  portalOrigin,
  sessionCookieName,
  sessionToken: sessionTokenResolution.sessionToken,
  workflowId,
  persona,
  title,
  deliverableType,
  firstBlockSummary,
  secondBlockSummary,
  unblockSummary
});

process.exitCode = result.ok ? 0 : 1;
process.stdout.write(
  JSON.stringify(
    {
      ok: result.ok,
      request: {
        tenantId,
        userId,
        role,
        workflowId,
        persona,
        title,
        deliverableType
      },
      proof: {
        baseUrl,
        portalOrigin,
        sessionCookieName,
        sessionTokenSource: sessionTokenResolution.source,
        envFilePath: seedEnvFilePath,
        sshEnvFilePath,
        expectedStaleContractCode: "stale_contract"
      },
      result
    },
    null,
    2
  ) + "\n"
);

async function resolveSessionToken({ providedSessionToken, tenantId, userId, role, expiresInMinutes, env }) {
  if (providedSessionToken) {
    return {
      source: "provided",
      sessionToken: providedSessionToken
    };
  }

  const runtimeAuth = await loadRuntimeAuthModule(env);
  const { createRuntimeSessionToken, loadRuntimeSessionAuthEnv } = runtimeAuth;
  const runtimeAuthEnv = loadRuntimeSessionAuthEnv(env);
  return {
    source: "generated",
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

async function loadRuntimeAuthModule(env) {
  try {
    return await import("../dist/api/runtime-auth.js");
  } catch {
    runCommand("npm run build:server", resolveNodeCommand("npm"), ["run", "build:server"], { env });
    return import("../dist/api/runtime-auth.js");
  }
}

function runCommand(label, command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    env: options.env ?? process.env,
    cwd: options.cwd ?? process.cwd(),
    shell: false
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`${label} failed with exit code ${result.status ?? "unknown"}`);
  }
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

function parseRole(value) {
  const normalized = normalizeValue(value) ?? "member";
  if (normalized !== "member" && normalized !== "operator") {
    throw new Error("--role must be member or operator");
  }
  return normalized;
}

function requireArg(args, name) {
  const value = normalizeValue(args[name]);
  if (!value) {
    throw new Error(`--${name} is required`);
  }
  return value;
}
