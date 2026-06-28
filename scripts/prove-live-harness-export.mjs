import { spawn, spawnSync } from "node:child_process";
import process from "node:process";
import { pathToFileURL } from "node:url";

import { postDashboardRunAndVerifyDurableBinding } from "./lib/live-dashboard-run-proof.mjs";
import { runLiveHarnessExportProof } from "./lib/live-harness-export-proof.mjs";
import { buildRequiredDeliveryWriterPrecondition, normalizeRemoteExportWriterConfig } from "./lib/live-harness-export-stage-config.mjs";
import { DEFAULT_STAGE_PROOF_ENV_FILE, DEFAULT_STAGE_SSH_ENV_FILE, parseStageProofArgs, resolveNodeCommand } from "./lib/stage-live-proof.mjs";
import { loadScriptEnv } from "./lib/script-env.mjs";

export async function runLiveHarnessExportStageProof(input = {}) {
  const args = input.args ?? parseStageProofArgs(process.argv.slice(2));
  const processEnv = input.processEnv ?? process.env;
  const loadSeedEnv = input.loadSeedEnv ?? loadScriptEnv;
  const loadSshEnv = input.loadSshEnv ?? loadScriptEnv;
  const postDashboardRunAndVerifyDurableBindingImpl =
    input.postDashboardRunAndVerifyDurableBinding ?? postDashboardRunAndVerifyDurableBinding;
  const runLiveHarnessExportProofImpl = input.runLiveHarnessExportProof ?? runLiveHarnessExportProof;
  const buildRequiredDeliveryWriterPreconditionImpl =
    input.buildRequiredDeliveryWriterPrecondition ?? buildRequiredDeliveryWriterPrecondition;
  const loadRemoteExportWriterConfigImpl =
    input.loadRemoteExportWriterConfig ?? loadRemoteExportWriterConfig;
  const resolveSessionTokenImpl = input.resolveSessionToken ?? resolveSessionToken;
  const loadFreshRunConflictDetailsImpl =
    input.loadFreshRunConflictDetails ?? loadRemoteFreshRunConflictDetails;
  const fetchImpl = input.fetchImpl ?? fetch;

  const seedEnvFilePath = normalizeValue(args["env-file"] ?? processEnv.WF_STAGE_ENV_FILE) ?? DEFAULT_STAGE_PROOF_ENV_FILE;
  const sshEnvFilePath = normalizeValue(args["ssh-env-file"] ?? processEnv.WF_STAGE_SSH_ENV_FILE) ?? DEFAULT_STAGE_SSH_ENV_FILE;
  const source = {
    ...loadSshEnv(sshEnvFilePath),
    ...loadSeedEnv(seedEnvFilePath)
  };
  const env = {
    ...processEnv,
    ...source
  };

  const tenantId = requireArg(args, "tenant");
  const userId = requireArg(args, "user");
  const workflowId = requireArg(args, "workflow");
  const boardWorkflowId = normalizeValue(args["board-workflow"] ?? env.WF_STAGE_BOARD_WORKFLOW_ID) ?? workflowId;
  const existingRunId = normalizeValue(args.run);
  const role = parseRole(args.role ?? env.WF_STAGE_PROOF_ROLE);
  const expiresInMinutes = parseExpiresInMinutes(args["expires-in-minutes"] ?? env.WF_STAGE_PROOF_TOKEN_TTL_MINUTES);
  const timeoutMs = parsePositiveInteger(args["timeout-ms"] ?? "15000", "timeout-ms");
  const pollIntervalMs = parsePositiveInteger(args["poll-interval-ms"] ?? "1000", "poll-interval-ms");
  const maxAttempts = parsePositiveInteger(args["max-attempts"] ?? "45", "max-attempts");
  const deliveryMode = normalizeValue(args["delivery-mode"] ?? env.WF_STAGE_EXPORT_DELIVERY_MODE) ?? "auto";
  const recoveryMode = normalizeRecoveryMode(args.mode ?? env.WF_STAGE_EXPORT_RECOVERY_MODE);
  const baseUrl = requireOrigin(args["base-url"] ?? env.WF_LIVE_BASE_URL ?? env.WF_STAGE_API_ORIGIN, "WF_LIVE_BASE_URL");
  const portalOrigin = requireOrigin(args["portal-origin"] ?? env.WF_SMOKE_PORTAL_URL ?? env.WF_STAGE_PORTAL_ORIGIN, "WF_SMOKE_PORTAL_URL");
  const sessionCookieName = normalizeValue(args["session-cookie-name"] ?? env.WF_PORTAL_SESSION_COOKIE_NAME) ?? "wf_portal_session";
  const providedSessionToken =
    normalizeValue(args["session-token"]) ??
    normalizeValue(env.WF_LIVE_SESSION_COOKIE_VALUE) ??
    normalizeValue(env.WF_SMOKE_SESSION_COOKIE_VALUE);
  let remoteVerification = null;
  let deliveryWriterConfig = null;

  function getRemoteVerification() {
    remoteVerification ??= buildRemoteVerificationConfig({ args, env });
    return remoteVerification;
  }

  const sessionTokenResolution = await resolveSessionTokenImpl({
    providedSessionToken,
    tenantId,
    userId,
    role,
    expiresInMinutes,
    env
  });

  if (recoveryMode === "replay" && !existingRunId) {
    return {
      ok: false,
      request: {
        tenantId,
        userId,
        role,
        workflowId,
        boardWorkflowId
      },
      proof: {
        apiOrigin: baseUrl,
        portalOrigin,
        sessionCookieName,
        sessionTokenSource: sessionTokenResolution.source,
        timeoutMs,
        pollIntervalMs,
        maxAttempts,
        deliveryMode,
        recoveryMode,
        boardWorkflowId,
        envFilePath: seedEnvFilePath,
        sshEnvFilePath,
        remoteVerification: null,
        deliveryWriterConfig: null
      },
      result: {
        durableResult: {
          ok: false,
          phase: "replay_mode_requires_explicit_run",
          notes: [
            "Replay recovery mode must target an explicit existing run instead of bootstrapping a fresh dashboard run."
          ]
        },
        exportProof: {
          ok: false,
          phase: "replay_mode_requires_explicit_run",
          notes: [
            "Replay recovery mode must target an explicit existing run instead of bootstrapping a fresh dashboard run."
          ]
        }
      }
    };
  }

  const durableResult = existingRunId
    ? {
        ok: true,
        runId: existingRunId,
        snapshot: null,
        verification: {
          ok: true,
          phase: "existing_run_selected",
          notes: [
            "The live harness export proof targeted an explicitly provided run id instead of starting a fresh dashboard run."
          ]
        }
      }
    : await postDashboardRunAndVerifyDurableBindingImpl({
        baseUrl,
        portalOrigin,
        sessionCookieName,
        sessionToken: sessionTokenResolution.sessionToken,
        tenantId,
        workflowId,
        freshRun: true,
        loadSnapshot: ({ tenantId: snapshotTenantId, runId }) =>
          loadRemoteWorkflowRunSnapshot({
            sshTarget: getRemoteVerification().sshTarget,
            sudoPassword: getRemoteVerification().sudoPassword,
            containerName: getRemoteVerification().containerName,
            tenantId: snapshotTenantId,
            runId
          }),
        fetchImpl: (url, options) => fetchWithTimeout(url, options, timeoutMs, fetchImpl)
      });
  const freshRunConflict =
    !existingRunId && isDashboardStartConflict(durableResult)
      ? await loadFreshRunConflictDetailsImpl({
          sshTarget: getRemoteVerification().sshTarget,
          sudoPassword: getRemoteVerification().sudoPassword,
          containerName: getRemoteVerification().containerName,
          tenantId,
          workflowId: boardWorkflowId
        })
      : null;

  let exportProofPrecondition = null;
  if (durableResult.ok && durableResult.runId && deliveryMode === "required") {
    try {
      deliveryWriterConfig = await loadRemoteExportWriterConfigImpl({
        sshTarget: getRemoteVerification().sshTarget,
        sudoPassword: getRemoteVerification().sudoPassword,
        containerName: getRemoteVerification().containerName
      });
      exportProofPrecondition = buildRequiredDeliveryWriterPreconditionImpl({
        deliveryMode,
        writerConfig: deliveryWriterConfig
      });
    } catch (error) {
      exportProofPrecondition = {
        ok: false,
        phase: "delivery_writer_preflight_failed",
        notes: [
          "The isolated stage proof could not verify the bounded delivery-writer precondition before running strict export delivery acceptance."
        ],
        error: error instanceof Error ? error.message : "Unknown remote writer preflight failure"
      };
    }
  }

  const exportProof =
    exportProofPrecondition ??
    (freshRunConflict?.phase === "fresh_harness_run_conflict"
      ? {
          ok: false,
          phase: "fresh_harness_run_conflict",
          ...(freshRunConflict.existingRunId ? { existingRunId: freshRunConflict.existingRunId } : {}),
          notes: [
            "The export proof requested a fresh dashboard bootstrap, but the native public harness uniqueness model would have forced reuse of an existing run.",
            "Clear or explicitly target the current run before retrying this fresh-start acceptance lane."
          ]
        }
      :
    (durableResult.ok && durableResult.runId
      ? await runLiveHarnessExportProofImpl({
          baseUrl,
          portalOrigin,
          sessionCookieName,
          sessionToken: sessionTokenResolution.sessionToken,
          tenantId,
          workflowId,
          boardWorkflowId,
          expectedRunId: durableResult.runId,
          deliveryMode,
          recoveryMode,
          maxAttempts,
          pollIntervalMs,
          loadDeliverySnapshot: ({ runId, candidateId }) =>
            loadRemoteExportDeliverySnapshot({
              sshTarget: getRemoteVerification().sshTarget,
              sudoPassword: getRemoteVerification().sudoPassword,
              containerName: getRemoteVerification().containerName,
              tenantId,
              runId,
              candidateId
          }),
          fetchImpl: (url, options) => fetchWithTimeout(url, options, timeoutMs, fetchImpl)
        })
      : {
          ok: false,
          phase: "dashboard_run_bootstrap_failed",
          notes: [
            "The export proof could not start because the dashboard-run bootstrap did not establish a durable run id."
          ]
        }));

  const ok = durableResult.ok && exportProof.ok;
  return {
    ok,
    request: {
      tenantId,
      userId,
      role,
      workflowId,
      boardWorkflowId
    },
    proof: {
      apiOrigin: baseUrl,
      portalOrigin,
      sessionCookieName,
      sessionTokenSource: sessionTokenResolution.source,
      timeoutMs,
      pollIntervalMs,
      maxAttempts,
      deliveryMode,
      recoveryMode,
      boardWorkflowId,
      envFilePath: seedEnvFilePath,
      sshEnvFilePath,
      remoteVerification: remoteVerification
        ? {
            sshTarget: remoteVerification.sshTarget,
            containerName: remoteVerification.containerName
          }
        : null,
      deliveryWriterConfig
    },
    result: {
      durableResult,
      exportProof
    }
  };
}

export async function main() {
  const result = await runLiveHarnessExportStageProof();
  process.exitCode = result.ok ? 0 : 1;
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
}

if (isMainModule(import.meta.url)) {
  await main();
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

async function fetchWithTimeout(url, options, timeoutMs, fetchImpl = fetch) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error(`Live harness export proof timed out after ${timeoutMs}ms`)), timeoutMs);

  try {
    return await fetchImpl(url, {
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
    throw new Error("WF_STAGE_SSH_TARGET or VPS2_USER/VPS2_HOST is required for remote harness export verification");
  }
  if (!sudoPassword) {
    throw new Error("VPS2_SUDO_PASSWORD is required for remote harness export verification");
  }

  return {
    sshTarget,
    sudoPassword,
    containerName
  };
}

function isDashboardStartConflict(result) {
  return !result?.ok && result?.error?.status === 409 && result?.error?.body?.code === "conflict";
}

async function loadRemoteFreshRunConflictDetails({ sshTarget, sudoPassword, containerName, tenantId, workflowId }) {
  const remoteScript = [
    "const pg = require('pg');",
    `const tenantId = ${JSON.stringify(tenantId)};`,
    `const workflowId = ${JSON.stringify(workflowId)};`,
    "(async () => {",
    "  const client = new pg.Client({",
    "    connectionString: process.env.SUPABASE_DB_URL,",
    "    ssl: process.env.SUPABASE_DB_SSL === 'false' ? undefined : { rejectUnauthorized: true }",
    "  });",
    "  await client.connect();",
    "  try {",
    "    const result = await client.query(",
    "      'select id from wfpc.harness_runs where tenant_id = $1 and workflow_id = $2 order by updated_at desc, created_at desc limit 1',",
    "      [tenantId, workflowId]",
    "    );",
    "    const existingRunId = String(result.rows[0]?.id ?? '');",
    "    console.log(JSON.stringify(existingRunId",
    "      ? { ok: false, phase: 'fresh_harness_run_conflict', existingRunId, mode: 'existing_harness_run_conflicts_with_fresh_proof' }",
    "      : { ok: false, phase: 'dashboard_run_bootstrap_conflict_unclassified' }",
    "    ));",
    "  } finally {",
    "    await client.end();",
    "  }",
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
  return JSON.parse(result.stdout.trim() || "null");
}

async function loadRemoteWorkflowRunSnapshot({ sshTarget, sudoPassword, containerName, tenantId, runId }) {
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
  const row = await loadRemoteJsonRow({
    sshTarget,
    sudoPassword,
    containerName,
    sql,
    params: [tenantId, runId]
  });

  return {
    run: {
      id: typeof row?.run_id === "string" ? row.run_id : "",
      status: typeof row?.run_status === "string" ? row.run_status : "",
      createdAt: asIsoTimestamp(row?.run_created_at),
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
      createdAt: asIsoTimestamp(row?.outbox_created_at),
      publicWorkflowId: typeof row?.outbox_public_workflow_id === "string" ? row.outbox_public_workflow_id : "",
      workflowTemplateId: typeof row?.outbox_workflow_template_id === "string" ? row.outbox_workflow_template_id : "",
      attempts: Number(row?.outbox_attempts ?? 0),
      lastError: typeof row?.outbox_last_error === "string" ? row.outbox_last_error : null
    }
  };
}

async function loadRemoteExportDeliverySnapshot({ sshTarget, sudoPassword, containerName, tenantId, runId, candidateId }) {
  const sql = [
    "select",
    "  id,",
    "  candidate_id,",
    "  status,",
    "  bundle_id,",
    "  bundle_revision,",
    "  idempotency_key,",
    "  attempt_count,",
    "  last_attempted_at,",
    "  delivered_at,",
    "  writer_kind,",
    "  delivery_receipt,",
    "  last_error_code,",
    "  last_error_message",
    "from wfpc.harness_export_deliveries",
    "where tenant_id = $1",
    "  and run_id = $2",
    "  and candidate_id = $3",
    "order by created_at desc",
    "limit 1"
  ].join(" ");
  const row = await loadRemoteJsonRow({
    sshTarget,
    sudoPassword,
    containerName,
    sql,
    params: [tenantId, runId, candidateId]
  });
  if (!row || typeof row !== "object") {
    return null;
  }

  return {
    id: typeof row.id === "string" ? row.id : "",
    candidateId: typeof row.candidate_id === "string" ? row.candidate_id : candidateId,
    status: typeof row.status === "string" ? row.status : "",
    bundleId: typeof row.bundle_id === "string" ? row.bundle_id : "",
    bundleRevision: typeof row.bundle_revision === "string" ? row.bundle_revision : "",
    idempotencyKey: typeof row.idempotency_key === "string" ? row.idempotency_key : "",
    attemptCount: Number(row.attempt_count ?? 0),
    lastAttemptedAt: asIsoTimestamp(row.last_attempted_at),
    deliveredAt: asIsoTimestamp(row.delivered_at),
    writerKind: typeof row.writer_kind === "string" ? row.writer_kind : null,
    deliveryReceipt: row.delivery_receipt && typeof row.delivery_receipt === "object" ? row.delivery_receipt : {},
    lastErrorCode: typeof row.last_error_code === "string" ? row.last_error_code : null,
    lastErrorMessage: typeof row.last_error_message === "string" ? row.last_error_message : null
  };
}

async function loadRemoteExportWriterConfig({ sshTarget, sudoPassword, containerName }) {
  const remoteScript = [
    "const fs = require('node:fs');",
    "const path = require('node:path');",
    "const exportRoot = typeof process.env.WF_OBSIDIAN_EXPORT_ROOT === 'string' && process.env.WF_OBSIDIAN_EXPORT_ROOT.trim().length > 0",
    "  ? process.env.WF_OBSIDIAN_EXPORT_ROOT.trim()",
    "  : null;",
    "let absolute = false;",
    "let exists = false;",
    "let directory = false;",
    "let writable = false;",
    "if (exportRoot) {",
    "  absolute = path.isAbsolute(exportRoot);",
    "  exists = fs.existsSync(exportRoot);",
    "  if (exists) {",
    "    try {",
    "      directory = fs.statSync(exportRoot).isDirectory();",
    "      if (directory) {",
    "        fs.accessSync(exportRoot, fs.constants.W_OK);",
    "        writable = true;",
    "      }",
    "    } catch {",
    "      directory = false;",
    "      writable = false;",
    "    }",
    "  }",
    "}",
    "console.log(JSON.stringify({ exportRoot, absolute, exists, directory, writable }));"
  ].join(" ");
  const row = await loadRemoteJsonValue({
    sshTarget,
    sudoPassword,
    containerName,
    remoteScript
  });
  return normalizeRemoteExportWriterConfig(row);
}

async function loadRemoteJsonRow({ sshTarget, sudoPassword, containerName, sql, params }) {
  const remoteScript = [
    "const pg = require('pg');",
    `const sql = ${JSON.stringify(sql)};`,
    `const params = ${JSON.stringify(params)};`,
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
  return await loadRemoteJsonValue({
    sshTarget,
    sudoPassword,
    containerName,
    remoteScript
  });
}

async function loadRemoteJsonValue({ sshTarget, sudoPassword, containerName, remoteScript }) {
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
  return JSON.parse(result.stdout.trim() || "null");
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

function normalizeRecoveryMode(value) {
  const normalized = normalizeValue(value) ?? "fresh";
  if (normalized !== "fresh" && normalized !== "replay") {
    throw new Error("--mode must be fresh or replay");
  }
  return normalized;
}

function shellEscapeSingleQuotes(value) {
  return value.replace(/'/g, `'\"'\"'`);
}

function asIsoTimestamp(value) {
  if (typeof value === "string" && value.trim().length > 0) {
    return value;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  return null;
}

function isMainModule(metaUrl) {
  const entry = process.argv[1];
  if (!entry) {
    return false;
  }
  return pathToFileURL(entry).href === metaUrl;
}
