import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import process from "node:process";

import { loadScriptEnv } from "./lib/script-env.mjs";
import { DEFAULT_STAGE_PROOF_ENV_FILE, resolveNodeCommand } from "./lib/stage-live-proof.mjs";

const DEFAULT_WORKFLOW_ID = "wf_connect_first_workflow";
const RESULT_APPROVAL_STATES_STORAGE_KEY = "wealth-factory.resultApprovalStates.v1";
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
const workflowId = normalizeValue(args.workflow ?? sourceEnv.WF_LIVE_HARNESS_WORKFLOW_ID ?? sourceEnv.WF_STAGE_PROOF_WORKFLOW_ID) ?? DEFAULT_WORKFLOW_ID;
const tenantId = normalizeValue(args.tenant ?? sourceEnv.WF_STAGE_PROOF_TENANT_ID);
const userId = normalizeValue(args.user ?? sourceEnv.WF_STAGE_PROOF_USER_ID);
const role = parseRole(args.role ?? sourceEnv.WF_STAGE_PROOF_ROLE);
const expiresInMinutes = parseExpiresInMinutes(args["expires-in-minutes"] ?? sourceEnv.WF_STAGE_PROOF_TOKEN_TTL_MINUTES);
const sessionCookieName =
  normalizeValue(args["session-cookie-name"] ?? sourceEnv.WF_PORTAL_SESSION_COOKIE_NAME ?? sourceEnv.WF_LIVE_SESSION_COOKIE_NAME) ??
  "wf_portal_session";
const providedSessionToken =
  normalizeValue(args["session-token"]) ??
  normalizeValue(sourceEnv.WF_LIVE_SESSION_COOKIE_VALUE) ??
  normalizeValue(sourceEnv.WF_SMOKE_SESSION_COOKIE_VALUE);
const sessionTokenSource = providedSessionToken ? "provided" : "minted";
const boardUrl = `${baseUrl}/board?workflowId=${encodeURIComponent(workflowId)}`;

if (!execute) {
  process.stdout.write(
    `${JSON.stringify(
      {
        ok: true,
        dryRun: true,
        phase: "dashboard_browser_journey_planned",
        apiOrigin: baseUrl,
        portalOrigin,
        envFilePath,
        sessionCookieName,
        sessionTokenSource,
        tenantId: tenantId ?? "<required-for-mint-session>",
        userId: userId ?? "<required-for-mint-session>",
        role,
        workflowId,
        boardUrl,
        request: {
          method: "GET",
          endpoint: boardUrl,
          mutates: false
        },
        browserHarness: resolveBrowserHarnessCommand(),
        note: "DRY RUN: no browser or network calls made. Pass --execute to run the read-only live browser journey proof."
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
const browserResult = spawnSync(resolveBrowserHarnessCommand(), [], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    BU_CDP_URL: process.env.BU_CDP_URL ?? "http://127.0.0.1:9333"
  },
  encoding: "utf8",
  input: buildBrowserHarnessProof({
    baseUrl,
    boardUrl,
    sessionCookieName,
    sessionToken: sessionTokenResolution.sessionToken
  }),
  stdio: ["pipe", "pipe", "pipe"]
});

if (browserResult.status !== 0) {
  throw new Error(
    [
      "live dashboard browser journey proof failed",
      `exit=${browserResult.status}`,
      browserResult.stdout.trim(),
      browserResult.stderr.trim()
    ]
      .filter(Boolean)
      .join("\n")
  );
}

const parsed = parseJson(browserResult.stdout.trim().split(/\r?\n/).at(-1) ?? "{}");
const ok = parsed?.ok === true && !containsForbiddenText(JSON.stringify(parsed));
process.exitCode = ok ? 0 : 1;
process.stdout.write(
  `${JSON.stringify(
    {
      ok,
      dryRun: false,
      phase: ok ? "dashboard_browser_journey_verified" : "dashboard_browser_journey_failed",
      apiOrigin: baseUrl,
      portalOrigin,
      envFilePath,
      sessionCookieName,
      sessionTokenSource: sessionTokenResolution.source,
      tenantId: tenantId ?? null,
      userId: userId ?? null,
      role,
      workflowId,
      boardUrl,
      browserHarnessUsed: true,
      checks: parsed?.checks ?? null,
      matchedForbiddenTokens: Array.isArray(parsed?.matchedForbiddenTokens) ? parsed.matchedForbiddenTokens : []
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

function buildBrowserHarnessProof({ baseUrl, boardUrl, sessionCookieName, sessionToken }) {
  return String.raw`
import json
import time

base_url = ${JSON.stringify(baseUrl)}
board_url = ${JSON.stringify(boardUrl)}
cookie_name = ${JSON.stringify(sessionCookieName)}
session_token = ${JSON.stringify(sessionToken)}
storage_key = ${JSON.stringify(RESULT_APPROVAL_STATES_STORAGE_KEY)}
forbidden = [
    "paperclip",
    "raw prompt",
    "system prompt",
    "prompt:",
    "skill",
    "command",
    "tool call",
    "raw activity",
    "internal log",
    "service token",
    "vault://",
    "wf_secret_",
    "access_token=",
    "api_key=",
    "api-key=",
    "authorization:",
    "Bearer ",
    "sk-",
    "pc-company-",
    "pc-run-",
    "pc-agent-",
]

new_tab("about:blank")
cdp("Network.enable")
cdp("Network.setCookie", name=cookie_name, value=session_token, url=base_url, secure=True, httpOnly=False)
cdp("Page.navigate", url=board_url)
wait_for_load()
time.sleep(2)

board_state = json.loads(js("""
(() => JSON.stringify({
  url: location.href,
  hasShell: document.querySelector('[data-testid="dashboard-shell"]') !== null,
  hasBoardPage: document.querySelector('[data-testid="page-board"]') !== null,
  hasHarnessBoard: document.querySelector('[data-testid="harness-board"]') !== null,
  text: document.body ? document.body.innerText : "",
  storage: localStorage.getItem("wealth-factory.resultApprovalStates.v1")
}))()
"""))

js("document.querySelector('[data-testid=\"nav-results\"]')?.click()")
time.sleep(1)

results_state = json.loads(js("""
(() => JSON.stringify({
  url: location.href,
  hasResultsPage: document.querySelector('[data-testid="page-results"]') !== null,
  text: document.body ? document.body.innerText : "",
  storage: localStorage.getItem("wealth-factory.resultApprovalStates.v1")
}))()
"""))

def matched_forbidden_tokens(value):
    lowered = json.dumps(value).lower()
    return [token for token in forbidden if token.lower() in lowered]

def no_forbidden_text(value):
    return len(matched_forbidden_tokens(value)) == 0

def storage_is_object(value):
    try:
        parsed = json.loads(value or "{}")
    except Exception:
        return False
    return isinstance(parsed, dict)

summary = {
    "matchedForbiddenTokens": sorted(set(matched_forbidden_tokens(board_state) + matched_forbidden_tokens(results_state))),
    "ok": (
        board_state["hasShell"]
        and board_state["hasBoardPage"]
        and board_state["hasHarnessBoard"]
        and results_state["hasResultsPage"]
        and storage_is_object(results_state["storage"])
        and no_forbidden_text(board_state)
        and no_forbidden_text(results_state)
    ),
    "checks": {
        "boardUrlLoaded": board_state["url"],
        "shellVisible": board_state["hasShell"],
        "boardPageVisible": board_state["hasBoardPage"],
        "harnessBoardVisible": board_state["hasHarnessBoard"],
        "resultsPageVisible": results_state["hasResultsPage"],
        "resultApprovalStorageIsObject": storage_is_object(results_state["storage"]),
        "forbiddenTextAbsent": no_forbidden_text(board_state) and no_forbidden_text(results_state),
    }
}
print(json.dumps(summary))
`;
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

function containsForbiddenText(value) {
  return /raw activity|internal log|service token|vault:\/\/|wf_secret_|access_token=|api[_-]?key[:=]|authorization[:=]|Bearer\s+|sk-[A-Za-z0-9_-]+|pc-(company|run|agent|goal|task)-/i.test(value);
}

function resolveBrowserHarnessCommand() {
  if (process.env.BROWSER_HARNESS_COMMAND) {
    return process.env.BROWSER_HARNESS_COMMAND;
  }

  const localWindowsHarness = "E:\\REPOS 2\\browser-harness\\.venv\\Scripts\\browser-harness.exe";
  return existsSync(localWindowsHarness) ? localWindowsHarness : "browser-harness";
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
