import { spawn, spawnSync } from "node:child_process";
import process from "node:process";

import { postDashboardRunAndVerifyDurableBinding } from "./lib/live-dashboard-run-proof.mjs";
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
const workflowId = requireArg(args, "workflow");
const role = parseRole(args.role ?? env.WF_STAGE_PROOF_ROLE);
const expiresInMinutes = parseExpiresInMinutes(args["expires-in-minutes"] ?? env.WF_STAGE_PROOF_TOKEN_TTL_MINUTES);
const timeoutMs = parsePositiveInteger(args["timeout-ms"] ?? "15000", "timeout-ms");
const baseUrl = requireOrigin(args["base-url"] ?? env.WF_LIVE_BASE_URL ?? env.WF_STAGE_API_ORIGIN, "WF_LIVE_BASE_URL");
const portalOrigin = requireOrigin(args["portal-origin"] ?? env.WF_SMOKE_PORTAL_URL ?? env.WF_STAGE_PORTAL_ORIGIN, "WF_SMOKE_PORTAL_URL");
const sessionCookieName = normalizeValue(args["session-cookie-name"] ?? env.WF_PORTAL_SESSION_COOKIE_NAME) ?? "wf_portal_session";
const providedSessionToken =
  normalizeValue(args["session-token"]) ??
  normalizeValue(env.WF_LIVE_SESSION_COOKIE_VALUE) ??
  normalizeValue(env.WF_SMOKE_SESSION_COOKIE_VALUE);
const remoteVerification = buildRemoteVerificationConfig({ args, env });

try {
  const sessionTokenResolution = await resolveSessionToken({
    providedSessionToken,
    tenantId,
    userId,
    role,
    expiresInMinutes,
    env
  });

  const result = await postDashboardRunAndVerifyDurableBinding({
    baseUrl,
    portalOrigin,
    sessionCookieName,
    sessionToken: sessionTokenResolution.sessionToken,
    tenantId,
    workflowId,
    loadSnapshot: ({ tenantId: snapshotTenantId, runId }) =>
      loadRemoteWorkflowRunSnapshot({
        sshTarget: remoteVerification.sshTarget,
        sudoPassword: remoteVerification.sudoPassword,
        containerName: remoteVerification.containerName,
        tenantId: snapshotTenantId,
        runId
      }),
    fetchImpl: (url, options) => fetchWithTimeout(url, options, timeoutMs)
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
          workflowId
        },
        proof: {
          apiOrigin: baseUrl,
          portalOrigin,
          sessionCookieName,
          sessionTokenSource: sessionTokenResolution.source,
          timeoutMs,
          envFilePath: seedEnvFilePath,
          sshEnvFilePath,
          remoteVerification: {
            sshTarget: remoteVerification.sshTarget,
            containerName: remoteVerification.containerName
          }
        },
        result
      },
      null,
      2
    ) + "\n"
  );
} finally {
}

async function resolveSessionToken({ providedSessionToken, tenantId, userId, role, expiresInMinutes, env }) {
  if (providedSessionToken) {
    return {
      source: "provided",
      sessionToken: providedSessionToken
    };
  }

  runCommand("npm run build:server", resolveNodeCommand("npm"), ["run", "build:server"], { env });
  const { createRuntimeSessionToken, loadRuntimeSessionAuthEnv } = await import("../dist/api/runtime-auth.js");
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

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error(`Dashboard run proof timed out after ${timeoutMs}ms`)), timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }
}

function buildRemoteVerificationConfig({ args, env }) {
  const sshTarget = normalizeValue(args["ssh-target"] ?? env.WF_STAGE_SSH_TARGET) ?? buildDefaultSshTarget(env);
  const sudoPassword = normalizeValue(env.VPS2_SUDO_PASSWORD);
  const containerName = normalizeValue(args["preflight-container"] ?? env.WF_STAGE_PREFLIGHT_CONTAINER) ?? "wf-stage-api";
  if (!sshTarget) {
    throw new Error("WF_STAGE_SSH_TARGET or VPS2_USER/VPS2_HOST is required for remote dashboard-run verification");
  }
  if (!sudoPassword) {
    throw new Error("VPS2_SUDO_PASSWORD is required for remote dashboard-run verification");
  }

  return {
    sshTarget,
    sudoPassword,
    containerName
  };
}

async function loadRemoteWorkflowRunSnapshot({ sshTarget, sudoPassword, containerName, tenantId, runId }) {
  process.stdout.write("\n>> remote durable workflow snapshot via wf-stage-api\n");
  const sql = [
    "select",
    "  run.id as run_id,",
    "  run.status as run_status,",
    "  run.created_at as run_created_at,",
    "  run.public_workflow_id,",
    "  run.workflow_template_id,",
    "  run.bound_secret_reference_id,",
    "  run.bound_provider_context,",
    "  secrets.secret_ref as current_secret_ref,",
    "  outbox.id as outbox_id,",
    "  outbox.status as outbox_status,",
    "  outbox.created_at as outbox_created_at,",
    "  outbox.public_workflow_id as outbox_public_workflow_id,",
    "  outbox.workflow_template_id as outbox_workflow_template_id,",
    "  outbox.attempts as outbox_attempts,",
    "  outbox.last_error as outbox_last_error",
    "from wfpc.workflow_runs run",
    "left join wfpc.secret_references secrets",
    "  on secrets.id = run.bound_secret_reference_id",
    " and secrets.tenant_id = run.tenant_id",
    " and secrets.revoked_at is null",
    "left join wfpc.workflow_queue_outbox outbox",
    "  on outbox.tenant_id = run.tenant_id",
    " and outbox.run_id = run.id",
    "where run.tenant_id = $1",
    "  and run.id = $2",
    "limit 1"
  ].join(" ");
  const remoteScript = [
    "const pg = require('pg');",
    `const sql = ${JSON.stringify(sql)};`,
    `const params = ${JSON.stringify([tenantId, runId])};`,
    "(async () => {",
    "  const client = new pg.Client({",
    "    connectionString: process.env.SUPABASE_DB_URL,",
    "    ssl: process.env.SUPABASE_DB_SSL === 'false' ? undefined : { rejectUnauthorized: true }",
    "  });",
    "  await client.connect();",
    "  const result = await client.query(sql, params);",
    "  console.log(JSON.stringify(result.rows[0] ?? null));",
    "  await client.end();",
    "})().catch((error) => {",
    "  console.error(error);",
    "  process.exit(1);",
    "});"
  ].join(" ");
  const encodedRemoteScript = Buffer.from(remoteScript, "utf8").toString("base64");
  const remoteCommand =
    `printf '%s\\n' '${shellEscapeSingleQuotes(sudoPassword)}' | sudo -S -p '' docker exec '${shellEscapeSingleQuotes(containerName)}' sh -lc ` +
    `"cd /app && node -e \\\"eval(Buffer.from('${encodedRemoteScript}','base64').toString())\\\""`; 
  const result = await sshExec({
    sshTarget,
    remoteCommand,
    timeoutMs: 30000,
    maxBufferBytes: 1024 * 1024
  });
  const row = JSON.parse(result.stdout.trim() || "null");
  return {
    run: {
      id: typeof row?.run_id === "string" ? row.run_id : "",
      status: typeof row?.run_status === "string" ? row.run_status : "",
      createdAt: typeof row?.run_created_at === "string" ? row.run_created_at : row?.run_created_at instanceof Date ? row.run_created_at.toISOString() : null,
      publicWorkflowId: typeof row?.public_workflow_id === "string" ? row.public_workflow_id : "",
      workflowTemplateId: typeof row?.workflow_template_id === "string" ? row.workflow_template_id : "",
      boundSecretReferenceId: typeof row?.bound_secret_reference_id === "string" ? row.bound_secret_reference_id : "",
      providerContext: Array.isArray(row?.bound_provider_context)
        ? row.bound_provider_context
            .filter((entry) => entry && typeof entry === "object")
            .map((entry) => ({
              capability: typeof entry.capability === "string" ? entry.capability : "",
              providerKind: typeof entry.providerKind === "string" ? entry.providerKind : "",
              label: typeof entry.label === "string" ? entry.label : "",
              secretRef: typeof row?.current_secret_ref === "string" ? row.current_secret_ref : "",
              metadata: entry.metadata && typeof entry.metadata === "object" ? entry.metadata : {}
            }))
            .filter((entry) => entry.capability && entry.providerKind && entry.label && entry.secretRef)
        : []
    },
    outbox: {
      id: typeof row?.outbox_id === "string" ? row.outbox_id : "",
      status: typeof row?.outbox_status === "string" ? row.outbox_status : "",
      createdAt: typeof row?.outbox_created_at === "string" ? row.outbox_created_at : row?.outbox_created_at instanceof Date ? row.outbox_created_at.toISOString() : null,
      publicWorkflowId: typeof row?.outbox_public_workflow_id === "string" ? row.outbox_public_workflow_id : "",
      workflowTemplateId: typeof row?.outbox_workflow_template_id === "string" ? row.outbox_workflow_template_id : "",
      attempts: Number(row?.outbox_attempts ?? 0),
      lastError: typeof row?.outbox_last_error === "string" ? row.outbox_last_error : null
    }
  };
}

function sshExec({ sshTarget, remoteCommand, timeoutMs, maxBufferBytes }) {
  return new Promise((resolve, reject) => {
    const child = spawn("ssh", [sshTarget, remoteCommand], {
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      child.kill("SIGKILL");
      reject(new Error(`SSH command timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdoutBytes += chunk.length;
      if (stdoutBytes > maxBufferBytes) {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          child.kill("SIGKILL");
          reject(new Error(`SSH stdout exceeded ${maxBufferBytes} bytes`));
        }
        return;
      }
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderrBytes += chunk.length;
      if (stderrBytes > maxBufferBytes) {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          child.kill("SIGKILL");
          reject(new Error(`SSH stderr exceeded ${maxBufferBytes} bytes`));
        }
        return;
      }
      stderr += String(chunk);
    });
    child.on("error", (error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
    child.on("exit", (code) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(stderr.trim() || `SSH command exited with code ${code ?? "unknown"}`));
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

function runCommand(label, command, commandArgs, options) {
  process.stdout.write(`\n>> ${label}\n`);
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
  const normalized = normalizeValue(value);
  if (!normalized) {
    throw new Error(`--${label} is required`);
  }
  const parsed = Number(normalized);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`--${label} must be a positive integer`);
  }
  return parsed;
}

function requireArg(args, name) {
  const value = normalizeValue(args[name]);
  if (!value) {
    throw new Error(`Missing required arg --${name}`);
  }
  return value;
}

function requireOrigin(value, envName) {
  const normalized = normalizeValue(value);
  if (!normalized) {
    throw new Error(`${envName} is required`);
  }
  return normalized.replace(/\/$/, "");
}

function buildDefaultSshTarget(env) {
  const user = normalizeValue(env.VPS2_USER);
  const host = normalizeValue(env.VPS2_HOST);
  if (!user || !host) {
    return null;
  }
  return `${user}@${host}`;
}

function normalizeValue(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function shellEscapeSingleQuotes(value) {
  return value.replace(/'/g, `'\"'\"'`);
}
