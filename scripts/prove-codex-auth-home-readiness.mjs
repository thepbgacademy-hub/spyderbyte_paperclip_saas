import { spawnSync } from "node:child_process";
import process from "node:process";

import { loadScriptEnv } from "./lib/script-env.mjs";
import { DEFAULT_STAGE_SSH_ENV_FILE } from "./lib/stage-live-proof.mjs";

const DEFAULT_CONTAINER = "wf-stage-api";
const DEFAULT_TIMEOUT_MS = 30_000;

const args = parseArgs(process.argv.slice(2));
const execute = args.execute === "true";
const container = validateContainerToken(normalizeValue(args.container ?? process.env.WF_STAGE_PREFLIGHT_CONTAINER) ?? DEFAULT_CONTAINER);
const targetCodexHome = validateCodexHomePath(normalizeValue(args["codex-home"] ?? process.env.WF_OPENAI_CODEX_HOME));
const timeoutMs = parseTimeoutMs(args["timeout-ms"] ?? process.env.WF_CODEX_AUTH_HOME_PROOF_TIMEOUT_MS);
const targetTenantId = normalizeValue(args["target-tenant"] ?? process.env.WF_CODEX_AUTH_HOME_TARGET_TENANT);
const targetWorkflowId = normalizeValue(args["target-workflow"] ?? process.env.WF_CODEX_AUTH_HOME_TARGET_WORKFLOW);
const authStateRef = normalizeValue(args["auth-state-ref"] ?? process.env.WF_OPENAI_CODEX_AUTH_STATE_REF);

if (!execute) {
  writeJson({
    ok: true,
    dryRun: true,
    phase: "codex_auth_home_readiness_dry_run",
    container,
    codexHomeSupplied: Boolean(targetCodexHome),
    targetTenantSupplied: Boolean(targetTenantId),
    targetWorkflowSupplied: Boolean(targetWorkflowId),
    authStateRefSupplied: Boolean(authStateRef),
    sshTargetSupplied: Boolean(normalizeValue(args["ssh-target"] ?? process.env.WF_STAGE_SSH_TARGET) ?? buildDefaultSshTarget(process.env)),
    sshEnvFileSupplied: Boolean(normalizeValue(args["ssh-env-file"] ?? process.env.WF_STAGE_SSH_ENV_FILE) ?? DEFAULT_STAGE_SSH_ENV_FILE),
    timeoutMs,
    checks: [
      "container running",
      "Codex CLI present inside worker lane",
      "CODEX_HOME set and resolves to a directory",
      "CODEX_HOME is writable by the container user",
      "non-secret Codex smoke prompt succeeds"
    ],
    mutationPerformed: false,
    dbRowsWritten: false,
    workflowRunsTouched: false,
    note: "DRY RUN: no secret files loaded and no SSH, Docker, database, workflow, DNS, Caddy, provider, or repair mutation performed. Pass --execute only for bounded readiness checks."
  });
  process.exit(0);
}

const sshEnvFilePath = normalizeValue(args["ssh-env-file"] ?? process.env.WF_STAGE_SSH_ENV_FILE) ?? DEFAULT_STAGE_SSH_ENV_FILE;
const env = {
  ...loadScriptEnv(sshEnvFilePath),
  ...process.env
};
const sshTarget = normalizeValue(args["ssh-target"] ?? env.WF_STAGE_SSH_TARGET) ?? buildDefaultSshTarget(env);

if (!sshTarget) {
  throw new Error("--ssh-target, WF_STAGE_SSH_TARGET, or VPS2_USER/VPS2_HOST is required before VPS Codex auth-home readiness execute");
}

const mockRemoteJson = normalizeValue(args["mock-remote-json"]);
const remoteResult = mockRemoteJson
  ? JSON.parse(mockRemoteJson)
  : runRemoteReadinessCheck({ sshTarget, container, targetCodexHome, timeoutMs });

writeJson(sanitizeRemoteResult({ remoteResult, container, sshTarget }));

function runRemoteReadinessCheck({ sshTarget, container, targetCodexHome, timeoutMs }) {
  const remoteCommand = buildRemoteCommand({ container, targetCodexHome, timeoutMs });
  const result = spawnSync("ssh", [sshTarget, remoteCommand], {
    cwd: process.cwd(),
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
    timeout: timeoutMs + 5_000
  });

  if (result.error) {
    return {
      ok: false,
      phase: result.error.message.includes("ETIMEDOUT") ? "ssh_timeout" : "ssh_unreachable",
      error: result.error.message
    };
  }
  if (typeof result.status === "number" && result.status !== 0) {
    const errorText = scrubSensitiveText(result.stderr || result.stdout || `ssh exited with status ${result.status}`);
    return {
      ok: false,
      phase: classifyRemoteFailure(errorText),
      error: errorText
    };
  }

  try {
    return JSON.parse(result.stdout.trim());
  } catch {
    return {
      ok: false,
      phase: "codex_readiness_output_invalid",
      error: "remote readiness check did not return JSON"
    };
  }
}

function buildRemoteCommand({ container, targetCodexHome, timeoutMs }) {
  const escapedContainer = shellEscape(container);
  const inspectScript = [
    `inspectOutput=$(docker inspect -f '{{.State.Running}}' ${escapedContainer} 2>&1)`,
    "inspectStatus=$?",
    "if [ $inspectStatus -ne 0 ]; then",
    "case \"$inspectOutput\" in",
    "*permission*denied*|*Permission*denied*) printf '{\"ok\":false,\"phase\":\"docker_permission_denied\",\"error\":\"docker inspect permission denied\",\"mutationPerformed\":false,\"dbRowsWritten\":false,\"workflowRunsTouched\":false}'; exit 0 ;;",
    "*Cannot*connect*Docker*daemon*|*Cannot*connect*docker*daemon*) printf '{\"ok\":false,\"phase\":\"docker_unavailable\",\"error\":\"docker inspect unavailable\",\"mutationPerformed\":false,\"dbRowsWritten\":false,\"workflowRunsTouched\":false}'; exit 0 ;;",
    "*) printf '{\"ok\":false,\"phase\":\"container_not_running\",\"mutationPerformed\":false,\"dbRowsWritten\":false,\"workflowRunsTouched\":false}'; exit 0 ;;",
    "esac",
    "fi",
    "if [ \"$inspectOutput\" != \"true\" ]; then printf '{\"ok\":false,\"phase\":\"container_not_running\",\"mutationPerformed\":false,\"dbRowsWritten\":false,\"workflowRunsTouched\":false}'; exit 0; fi"
  ].join("\n");
  const codexHomeEnvArg = targetCodexHome ? ` -e CODEX_HOME=${shellEscape(targetCodexHome)}` : "";
  const dockerCommand = `${inspectScript}\ndocker exec${codexHomeEnvArg} ${escapedContainer} sh -c ${shellEscape(buildContainerReadinessScript({ timeoutMs }))}`;
  return dockerCommand;
}

function buildContainerReadinessScript({ timeoutMs }) {
  const timeoutSeconds = Math.max(1, Math.ceil(timeoutMs / 1000));
  return [
    "set +e",
    "command -v codex >/dev/null 2>&1",
    "if [ $? -ne 0 ]; then printf '{\"ok\":false,\"phase\":\"codex_cli_missing\",\"codexCliPresent\":false,\"mutationPerformed\":false,\"dbRowsWritten\":false,\"workflowRunsTouched\":false}'; exit 0; fi",
    "if [ -z \"$CODEX_HOME\" ] || [ ! -d \"$CODEX_HOME\" ]; then printf '{\"ok\":false,\"phase\":\"codex_home_missing\",\"codexCliPresent\":true,\"codexHomeExists\":false,\"mutationPerformed\":false,\"dbRowsWritten\":false,\"workflowRunsTouched\":false}'; exit 0; fi",
    "if [ ! -w \"$CODEX_HOME\" ]; then printf '{\"ok\":false,\"phase\":\"codex_home_not_writable\",\"codexCliPresent\":true,\"codexHomeExists\":true,\"codexHomeWritable\":false,\"mutationPerformed\":false,\"dbRowsWritten\":false,\"workflowRunsTouched\":false}'; exit 0; fi",
    "codex_home_fingerprint=$(printf '%s' \"$CODEX_HOME\" | sha256sum | awk '{print substr($1,1,16)}')",
    `printf 'Reply with exactly READY and no punctuation.' | timeout ${timeoutSeconds} codex exec --skip-git-repo-check --ephemeral --ignore-user-config --ignore-rules --color never - >/tmp/wf-codex-smoke.out 2>/tmp/wf-codex-smoke.err`,
    "status=$?",
    "smoke=$(tr -d '\\r' </tmp/wf-codex-smoke.out | tail -n 1 | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')",
    "if [ $status -ne 0 ] || [ \"$smoke\" != \"READY\" ]; then smoke_error_json=$(node -e \"const fs=require('fs'); const text=fs.existsSync('/tmp/wf-codex-smoke.err') ? fs.readFileSync('/tmp/wf-codex-smoke.err','utf8').split(/\\\\r?\\\\n/).slice(-12).join('\\\\n') : ''; process.stdout.write(JSON.stringify(text.slice(0,2000)));\" 2>/dev/null || printf '\"codex smoke failed\"'); rm -f /tmp/wf-codex-smoke.out /tmp/wf-codex-smoke.err; printf '{\"ok\":false,\"phase\":\"codex_smoke_failed\",\"codexCliPresent\":true,\"codexHomeExists\":true,\"codexHomeWritable\":true,\"codexHomeFingerprint\":\"%s\",\"smokePromptPassed\":false,\"smokeError\":%s,\"mutationPerformed\":false,\"dbRowsWritten\":false,\"workflowRunsTouched\":false}' \"$codex_home_fingerprint\" \"$smoke_error_json\"; exit 0; fi",
    "rm -f /tmp/wf-codex-smoke.out /tmp/wf-codex-smoke.err",
    "printf '{\"ok\":true,\"phase\":\"codex_auth_home_ready\",\"codexCliPresent\":true,\"codexHomeExists\":true,\"codexHomeWritable\":true,\"codexHomeFingerprint\":\"%s\",\"smokePromptPassed\":true,\"mutationPerformed\":false,\"dbRowsWritten\":false,\"workflowRunsTouched\":false}' \"$codex_home_fingerprint\""
  ].join("; ");
}

function sanitizeRemoteResult({ remoteResult, container, sshTarget }) {
  const phase = classifyReadinessPhase(remoteResult);
  return {
    ok: Boolean(remoteResult.ok),
    dryRun: false,
    phase,
    container,
    ...(targetTenantId ? { targetTenantId } : {}),
    ...(targetWorkflowId ? { targetWorkflowId } : {}),
    ...(authStateRef ? { authStateRef } : {}),
    sshTarget: maskSshTarget(sshTarget),
    codexCliChecked: Object.hasOwn(remoteResult, "codexCliPresent"),
    codexHomeChecked: Object.hasOwn(remoteResult, "codexHomeExists"),
    smokePromptChecked: Object.hasOwn(remoteResult, "smokePromptPassed"),
    codexCliPresent: Boolean(remoteResult.codexCliPresent),
    codexHomeExists: Boolean(remoteResult.codexHomeExists),
    ...(Object.hasOwn(remoteResult, "codexHomeWritable") ? { codexHomeWritable: Boolean(remoteResult.codexHomeWritable) } : {}),
    ...(typeof remoteResult.codexHomeFingerprint === "string" ? { codexHomeFingerprint: remoteResult.codexHomeFingerprint } : {}),
    smokePromptPassed: Boolean(remoteResult.smokePromptPassed),
    ...(remoteResult.smokeError ? { smokeError: scrubSensitiveText(String(remoteResult.smokeError)) } : {}),
    mutationPerformed: Boolean(remoteResult.mutationPerformed),
    dbRowsWritten: Boolean(remoteResult.dbRowsWritten),
    workflowRunsTouched: Boolean(remoteResult.workflowRunsTouched),
    ...(remoteResult.error ? { error: scrubSensitiveText(String(remoteResult.error)) } : {})
  };
}

function classifyReadinessPhase(remoteResult) {
  const phase = typeof remoteResult.phase === "string" ? remoteResult.phase : "codex_readiness_output_invalid";
  const smokeError = typeof remoteResult.smokeError === "string" ? remoteResult.smokeError : "";
  if (
    phase === "codex_smoke_failed" &&
    /refresh_token_invalidated|refresh token was revoked|session has ended|authentication token has been invalidated/i.test(smokeError)
  ) {
    return "codex_auth_session_revoked";
  }
  if (
    phase === "codex_smoke_failed" &&
    /missing bearer|missing authentication|no auth token|unauthorized: missing/i.test(smokeError)
  ) {
    return "codex_auth_session_missing";
  }

  return phase;
}

function parseArgs(values) {
  const parsed = {};
  const booleanFlags = new Set(["execute"]);
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value.startsWith("--")) {
      continue;
    }
    const key = value.slice(2);
    if (booleanFlags.has(key)) {
      parsed[key] = "true";
      continue;
    }
    parsed[key] = values[index + 1] ?? "";
    index += 1;
  }
  return parsed;
}

function buildDefaultSshTarget(env) {
  const user = normalizeValue(env.VPS2_USER);
  const host = normalizeValue(env.VPS2_HOST);
  return user && host ? `${user}@${host}` : null;
}

function validateContainerToken(value) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value)) {
    throw new Error("--container must be a shell-safe Docker container token");
  }
  return value;
}

function validateCodexHomePath(value) {
  if (!value) {
    return null;
  }
  if (!/^\/[A-Za-z0-9._/-]+$/.test(value) || value.includes("..")) {
    throw new Error("--codex-home must be an absolute shell-safe VPS path");
  }
  return value;
}

function maskSshTarget(value) {
  const normalized = normalizeValue(value);
  if (!normalized) {
    return null;
  }
  const [user] = normalized.split("@");
  return `${user || "ssh"}@[masked]`;
}

function shellEscape(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function normalizeValue(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function scrubSensitiveText(value) {
  return value
    .replace(/sk-[A-Za-z0-9_-]+/g, "<redacted>")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer <redacted>")
    .replace(/postgres(?:ql)?:\/\/\S+/gi, "postgresql://<redacted>")
    .replace(/CODEX_HOME=[^\s]+/g, "CODEX_HOME=<redacted>")
    .replace(/\/home\/deploy\/wealth-factory-stage\/codex-homes\/[^\s"']+/g, "<codex-home>")
    .replace(/E:\\the_secrets/gi, "<secrets-dir>");
}

function classifyRemoteFailure(value) {
  if (/permission denied while trying to connect to the docker API/i.test(value)) {
    return "docker_permission_denied";
  }
  return /cannot connect to the docker daemon/i.test(value)
    ? "docker_unavailable"
    : "remote_command_failed";
}

function parseTimeoutMs(value) {
  const normalized = normalizeValue(value);
  if (!normalized) {
    return DEFAULT_TIMEOUT_MS;
  }
  const parsed = Number(normalized);
  if (!Number.isInteger(parsed) || parsed < 1_000 || parsed > 300_000) {
    throw new Error("--timeout-ms must be an integer between 1000 and 300000");
  }
  return parsed;
}

function writeJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}
