import { spawn, spawnSync } from "node:child_process";
import process from "node:process";
import { pathToFileURL } from "node:url";

import { pollForClosedBoardExportCandidate } from "./lib/live-export-closure-proof.mjs";
import { runLiveHarnessExportReplayCycle } from "./lib/live-harness-export-replay-cycle.mjs";
import { DEFAULT_STAGE_PROOF_ENV_FILE, DEFAULT_STAGE_SSH_ENV_FILE, parseStageProofArgs, resolveNodeCommand } from "./lib/stage-live-proof.mjs";
import { loadScriptEnv } from "./lib/script-env.mjs";

const DEFAULT_REMOTE_STAGE_ENV_PATH = "/home/deploy/wealth-factory-stage/wf-stage.vps2.env";
const DEFAULT_REMOTE_STAGE_COMPOSE_PATH = "/home/deploy/wealth-factory-stage/docker-compose.vps2-isolated-stage.yml";

export async function runLiveHarnessExportReplayCycleStageProof(input = {}) {
  const args = input.args ?? parseStageProofArgs(process.argv.slice(2));
  const processEnv = input.processEnv ?? process.env;
  const loadSeedEnv = input.loadSeedEnv ?? loadScriptEnv;
  const loadSshEnv = input.loadSshEnv ?? loadScriptEnv;
  const resolveSessionTokenImpl = input.resolveSessionToken ?? resolveSessionToken;
  const runReplayCycleImpl = input.runLiveHarnessExportReplayCycle ?? runLiveHarnessExportReplayCycle;
  const loadRemoteExportWriterConfigImpl = input.loadRemoteExportWriterConfig ?? loadRemoteExportWriterConfig;
  const setRemoteWriterRootStateImpl = input.setRemoteWriterRootState ?? setRemoteWriterRootState;
  const loadRemoteExportDeliverySnapshotImpl = input.loadRemoteExportDeliverySnapshot ?? loadRemoteExportDeliverySnapshot;
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
  const runId = normalizeValue(args.run);
  const timeoutMs = parsePositiveInteger(args["timeout-ms"] ?? "15000", "timeout-ms");
  const pollIntervalMs = parsePositiveInteger(args["poll-interval-ms"] ?? "1000", "poll-interval-ms");
  const maxAttempts = parsePositiveInteger(args["max-attempts"] ?? "45", "max-attempts");
  const role = parseRole(args.role ?? env.WF_STAGE_PROOF_ROLE);
  const expiresInMinutes = parseExpiresInMinutes(args["expires-in-minutes"] ?? env.WF_STAGE_PROOF_TOKEN_TTL_MINUTES);
  const baseUrl = requireOrigin(args["base-url"] ?? env.WF_LIVE_BASE_URL ?? env.WF_STAGE_API_ORIGIN, "WF_LIVE_BASE_URL");
  const portalOrigin = requireOrigin(args["portal-origin"] ?? env.WF_SMOKE_PORTAL_URL ?? env.WF_STAGE_PORTAL_ORIGIN, "WF_SMOKE_PORTAL_URL");
  const sessionCookieName = normalizeValue(args["session-cookie-name"] ?? env.WF_PORTAL_SESSION_COOKIE_NAME) ?? "wf_portal_session";
  const providedSessionToken =
    normalizeValue(args["session-token"]) ??
    normalizeValue(env.WF_LIVE_SESSION_COOKIE_VALUE) ??
    normalizeValue(env.WF_SMOKE_SESSION_COOKIE_VALUE);
  const failureWriterRoot = normalizeValue(args["failure-writer-root"]);

  if (!runId) {
    return {
      ok: false,
      request: {
        tenantId,
        userId,
        workflowId,
        boardWorkflowId
      },
      result: {
        replayCycle: {
          ok: false,
          phase: "replay_cycle_requires_explicit_run",
          notes: [
            "The live export replay cycle must target an explicit existing run id."
          ]
        }
      }
    };
  }

  const remoteVerification = buildRemoteVerificationConfig({ args, env });
  const sessionTokenResolution = await resolveSessionTokenImpl({
    providedSessionToken,
    tenantId,
    userId,
    role,
    expiresInMinutes,
    env
  });

  const stageFetch = createAuthenticatedStageFetch({
    baseUrl,
    portalOrigin,
    sessionCookieName,
    sessionToken: sessionTokenResolution.sessionToken,
    timeoutMs,
    fetchImpl
  });

  const replayCycle = await runReplayCycleImpl({
    runId,
    failureWriterRoot,
    loadWriterConfig: () =>
      loadRemoteExportWriterConfigImpl({
        sshTarget: remoteVerification.sshTarget,
        sudoPassword: remoteVerification.sudoPassword,
        containerName: remoteVerification.containerName
      }),
    setWriterRootState: ({ mode, writerRoot, restoreWriterRoot }) =>
      setRemoteWriterRootStateImpl({
        mode,
        writerRoot,
        restoreWriterRoot,
        sshTarget: remoteVerification.sshTarget,
        sudoPassword: remoteVerification.sudoPassword,
        containerName: remoteVerification.containerName,
        remoteEnvFilePath: normalizeValue(args["remote-env-file"]) ?? DEFAULT_REMOTE_STAGE_ENV_PATH,
        remoteComposeFilePath: normalizeValue(args["remote-compose-file"]) ?? DEFAULT_REMOTE_STAGE_COMPOSE_PATH
      }),
    loadClosedBoardCandidate: ({ candidateId }) =>
      loadClosedBoardCandidate({
        fetchImpl: stageFetch,
        workflowId: boardWorkflowId,
        expectedRunId: runId,
        candidateId,
        maxAttempts,
        pollIntervalMs
      }),
    loadCandidateDeliverySnapshot: ({ candidateId }) =>
      loadRemoteExportDeliverySnapshotImpl({
        sshTarget: remoteVerification.sshTarget,
        sudoPassword: remoteVerification.sudoPassword,
        containerName: remoteVerification.containerName,
        tenantId,
        runId,
        candidateId
      }),
    postCandidateAction: ({ candidateId, action }) =>
      postCandidateAction({
        fetchImpl: stageFetch,
        runId,
        candidateId,
        action
      }),
    waitForCandidateDeliveryStatus: ({ candidateId, acceptedStatuses }) =>
      waitForCandidateDeliveryStatus({
        fetchImpl: stageFetch,
        loadDeliverySnapshot: () =>
          loadRemoteExportDeliverySnapshotImpl({
            sshTarget: remoteVerification.sshTarget,
            sudoPassword: remoteVerification.sudoPassword,
            containerName: remoteVerification.containerName,
            tenantId,
            runId,
            candidateId
          }),
        workflowId: boardWorkflowId,
        expectedRunId: runId,
        candidateId,
        acceptedStatuses,
        maxAttempts,
        pollIntervalMs
      })
  });

  return {
    ok: replayCycle.ok,
    request: {
      tenantId,
      userId,
      workflowId,
      boardWorkflowId,
      runId
    },
    proof: {
      apiOrigin: baseUrl,
      portalOrigin,
      sessionCookieName,
      sessionTokenSource: sessionTokenResolution.source,
      timeoutMs,
      pollIntervalMs,
      maxAttempts,
      remoteVerification: {
        sshTarget: remoteVerification.sshTarget,
        containerName: remoteVerification.containerName
      },
      failureWriterRoot: replayCycle.writerRoot?.failure ?? failureWriterRoot ?? null
    },
    result: {
      replayCycle
    }
  };
}

export async function main() {
  const result = await runLiveHarnessExportReplayCycleStageProof();
  process.exitCode = result.ok ? 0 : 1;
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
}

if (isMainModule(import.meta.url)) {
  await main();
}

async function loadClosedBoardCandidate({ fetchImpl, workflowId, expectedRunId, candidateId, maxAttempts, pollIntervalMs }) {
  const result = await pollForClosedBoardExportCandidate({
    fetch: fetchImpl,
    workflowId,
    expectedRunId,
    candidateId,
    maxAttempts,
    pollIntervalMs,
    sleep: sleep
  });
  return {
    ...result,
    candidate: result.exportCandidate ?? null
  };
}

async function postCandidateAction({ fetchImpl, runId, candidateId, action }) {
  const actionPath = normalizeValue(action?.actionPath);
  const actionHandle = normalizeValue(action?.actionHandle);
  if (!actionPath || !actionHandle) {
    return {
      status: 0,
      body: null
    };
  }

  const response = await fetchImpl(actionPath, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      actionHandle
    })
  });
  const body = await readJson(response);
  return {
    status: response.status,
    body,
    runId,
    candidateId
  };
}

async function waitForCandidateDeliveryStatus(input) {
  const accepted = new Set(input.acceptedStatuses);
  let board = null;
  let deliverySnapshot = null;

  for (let attempt = 1; attempt <= input.maxAttempts; attempt += 1) {
    board = await loadBoardState({
      fetchImpl: input.fetchImpl,
      workflowId: input.workflowId
    });
    const candidate = Array.isArray(board?.memoryBoundary?.exportCandidates)
      ? board.memoryBoundary.exportCandidates.find((entry) => entry?.id === input.candidateId)
      : null;
    if (
      normalizeValue(board?.runId) === input.expectedRunId
      && normalizeValue(board?.boardState) === "closed"
      && candidate
    ) {
      deliverySnapshot = await input.loadDeliverySnapshot();
      const deliveryStatus =
        normalizeValue(deliverySnapshot?.status) ??
        normalizeValue(candidate?.latestDelivery?.status);
      if (deliveryStatus && accepted.has(deliveryStatus)) {
        return {
          candidateId: input.candidateId,
          deliveryStatus,
          board,
          candidate,
          deliverySnapshot
        };
      }
    }

    if (attempt < input.maxAttempts) {
      await sleep(input.pollIntervalMs);
    }
  }

  throw new Error(
    `Timed out before ${input.candidateId} reached one of the accepted delivery states: ${[...accepted].join(", ")}`
  );
}

async function loadBoardState({ fetchImpl, workflowId }) {
  const response = await fetchImpl(`/api/harness/board?workflowId=${encodeURIComponent(workflowId)}`, {
    method: "GET"
  });
  const body = await readJson(response);
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`Live board request failed with HTTP ${response.status}`);
  }
  return body;
}

function createAuthenticatedStageFetch({ baseUrl, portalOrigin, sessionCookieName, sessionToken, timeoutMs, fetchImpl }) {
  return async function authenticatedStageFetch(path, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(new Error(`Replay-cycle request timed out after ${timeoutMs}ms`)),
      timeoutMs
    );
    const url = new URL(path, baseUrl);
    const headers = {
      ...(options.headers ?? {}),
      cookie: `${sessionCookieName}=${sessionToken}`,
      origin: portalOrigin
    };

    try {
      return await fetchImpl(url.toString(), {
        ...options,
        headers,
        signal: controller.signal
      });
    } finally {
      clearTimeout(timeout);
    }
  };
}

function buildRemoteVerificationConfig({ args, env }) {
  const sshTarget = normalizeValue(args["ssh-target"] ?? env.WF_STAGE_SSH_TARGET) ?? buildDefaultSshTarget(env);
  const sudoPassword = normalizeValue(env.VPS2_SUDO_PASSWORD);
  const containerName = normalizeValue(args["preflight-container"] ?? env.WF_STAGE_PREFLIGHT_CONTAINER) ?? "wf-stage-api";
  if (!sshTarget) {
    throw new Error("WF_STAGE_SSH_TARGET or VPS2_USER/VPS2_HOST is required for remote export replay verification");
  }
  if (!sudoPassword) {
    throw new Error("VPS2_SUDO_PASSWORD is required for remote export replay verification");
  }
  return {
    sshTarget,
    sudoPassword,
    containerName
  };
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

async function setRemoteWriterRootState(input) {
  await updateRemoteStageEnvWriterRoot(input);
  await recreateRemoteStageApi(input);
  if (input.mode === "broken") {
    await materializeRemoteWriterFailureFile(input);
  } else {
    await ensureRemoteWriterDirectory(input);
  }
  return await loadRemoteExportWriterConfig(input);
}

async function updateRemoteStageEnvWriterRoot({ sshTarget, sudoPassword, remoteEnvFilePath, writerRoot }) {
  const escapedPassword = shellEscapeSingleQuotes(sudoPassword);
  const escapedEnvPath = shellEscapeSingleQuotes(remoteEnvFilePath);
  const escapedRoot = shellEscapeSingleQuotes(writerRoot);
  const remoteCommand = [
    `printf '%s\\n' '${escapedPassword}' | sudo -S -p '' sh -lc`,
    `"if grep -q '^WF_OBSIDIAN_EXPORT_ROOT=' '${escapedEnvPath}'; then`,
    `  sed -i \\\"s|^WF_OBSIDIAN_EXPORT_ROOT=.*$|WF_OBSIDIAN_EXPORT_ROOT=${escapedRoot}|\\\" '${escapedEnvPath}';`,
    "else",
    `  printf '\\nWF_OBSIDIAN_EXPORT_ROOT=${escapedRoot}\\n' >> '${escapedEnvPath}';`,
    "fi\""
  ].join(" ");
  await sshExec({
    sshTarget,
    remoteCommand,
    timeoutMs: 30000,
    maxBufferBytes: 1024 * 1024
  });
}

async function recreateRemoteStageApi({ sshTarget, sudoPassword, remoteEnvFilePath, remoteComposeFilePath }) {
  const remoteCommand = [
    `printf '%s\\n' '${shellEscapeSingleQuotes(sudoPassword)}' | sudo -S -p '' sh -lc`,
    `"cd /home/deploy/wealth-factory-stage && docker compose --env-file '${shellEscapeSingleQuotes(remoteEnvFilePath)}' -f '${shellEscapeSingleQuotes(remoteComposeFilePath)}' up -d --no-deps wf-stage-api"`
  ].join(" ");
  await sshExec({
    sshTarget,
    remoteCommand,
    timeoutMs: 120000,
    maxBufferBytes: 1024 * 1024
  });
}

async function materializeRemoteWriterFailureFile({ sshTarget, sudoPassword, containerName, writerRoot }) {
  const remoteCommand =
    `printf '%s\\n' '${shellEscapeSingleQuotes(sudoPassword)}' | sudo -S -p '' docker exec '${shellEscapeSingleQuotes(containerName)}' sh -lc ` +
    `'rm -rf ${shellEscapeSingleQuotes(writerRoot)} && : > ${shellEscapeSingleQuotes(writerRoot)}'`;
  await sshExec({
    sshTarget,
    remoteCommand,
    timeoutMs: 30000,
    maxBufferBytes: 1024 * 1024
  });
}

async function ensureRemoteWriterDirectory({ sshTarget, sudoPassword, containerName, writerRoot }) {
  const remoteCommand =
    `printf '%s\\n' '${shellEscapeSingleQuotes(sudoPassword)}' | sudo -S -p '' docker exec '${shellEscapeSingleQuotes(containerName)}' sh -lc ` +
    `'mkdir -p ${shellEscapeSingleQuotes(writerRoot)}'`;
  await sshExec({
    sshTarget,
    remoteCommand,
    timeoutMs: 30000,
    maxBufferBytes: 1024 * 1024
  });
}

async function loadRemoteExportWriterConfig({ sshTarget, sudoPassword, containerName }) {
  const remoteScript = [
    "const fs = require('node:fs');",
    "const path = require('node:path');",
    "const exportRoot = typeof process.env.WF_OBSIDIAN_EXPORT_ROOT === 'string' && process.env.WF_OBSIDIAN_EXPORT_ROOT.trim().length > 0",
    "  ? process.env.WF_OBSIDIAN_EXPORT_ROOT.trim()",
    "  : null;",
    "const configured = exportRoot !== null;",
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
    "console.log(JSON.stringify({ configured, exportRoot, absolute, exists, directory, writable }));"
  ].join(" ");
  return await loadRemoteJsonValue({
    sshTarget,
    sudoPassword,
    containerName,
    remoteScript
  });
}

async function loadRemoteExportDeliverySnapshot({ sshTarget, sudoPassword, containerName, tenantId, runId, candidateId }) {
  const sql = [
    "select candidate_id, status, bundle_revision, idempotency_key, attempt_count, delivered_at, last_error_code, last_error_message",
    "from wfpc.harness_export_deliveries",
    "where tenant_id = $1 and run_id = $2 and candidate_id = $3",
    "order by created_at desc",
    "limit 1"
  ].join(" ");
  return await loadRemoteJsonRow({
    sshTarget,
    sudoPassword,
    containerName,
    sql,
    params: [tenantId, runId, candidateId]
  });
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
    "  try {",
    "    const result = await client.query(sql, params);",
    "    console.log(JSON.stringify(result.rows[0] ?? null));",
    "  } finally {",
    "    await client.end();",
    "  }",
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
    const stdoutLimit = maxBufferBytes ?? 1024 * 1024;
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`SSH command timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
      if (stdout.length > stdoutLimit) {
        child.kill("SIGTERM");
        reject(new Error("SSH stdout exceeded buffer limit"));
      }
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
      if (stderr.length > stdoutLimit) {
        child.kill("SIGTERM");
        reject(new Error("SSH stderr exceeded buffer limit"));
      }
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve({ stdout, stderr, code });
        return;
      }
      reject(new Error(stderr.trim() || stdout.trim() || `SSH command failed with exit code ${code}`));
    });
  });
}

function runCommand(label, command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
    ...options
  });
  if (result.error) {
    throw new Error(`${label} failed: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`${label} failed with exit code ${result.status ?? "unknown"}`);
  }
}

function requireArg(args, name) {
  const value = normalizeValue(args[name]);
  if (!value) {
    throw new Error(`--${name} is required`);
  }
  return value;
}

function requireOrigin(value, name) {
  const normalized = normalizeValue(value);
  if (!normalized) {
    throw new Error(`${name} is required`);
  }
  return normalized.replace(/\/$/, "");
}

function parsePositiveInteger(value, name) {
  const normalized = normalizeValue(value);
  const parsed = Number(normalized);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`--${name} must be a positive integer`);
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
  return String(value).replace(/'/g, "'\"'\"'");
}

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isMainModule(moduleUrl) {
  if (!process.argv[1]) {
    return false;
  }
  return pathToFileURL(process.argv[1]).href === moduleUrl;
}
