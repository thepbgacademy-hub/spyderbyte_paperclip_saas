import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

const webPort = Number(process.env.WF_BROWSER_PROOF_PORT ?? "43191");
const baseUrl = `http://127.0.0.1:${webPort}`;
const harness = resolveBrowserHarnessCommand();
const RESULT_APPROVAL_STATES_STORAGE_KEY = "wealth-factory.resultApprovalStates.v1";

const viteCommand = process.platform === "win32" ? "cmd" : "npx";
const viteArgs =
  process.platform === "win32"
    ? ["/c", "npx", "vite", "apps/web", "--host", "127.0.0.1", "--port", String(webPort), "--strictPort"]
    : ["vite", "apps/web", "--host", "127.0.0.1", "--port", String(webPort), "--strictPort"];

const server = spawn(viteCommand, viteArgs, {
  cwd: process.cwd(),
  env: process.env,
  stdio: ["ignore", "pipe", "pipe"]
});

let serverOutput = "";
server.stdout.on("data", (chunk) => {
  serverOutput += chunk.toString();
});
server.stderr.on("data", (chunk) => {
  serverOutput += chunk.toString();
});

try {
  await waitForServer(`${baseUrl}/`);

  const result = spawnSync(harness, [], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      BU_CDP_URL: process.env.BU_CDP_URL ?? "http://127.0.0.1:9333"
    },
    encoding: "utf8",
    input: buildBrowserHarnessProof(baseUrl),
    stdio: ["pipe", "pipe", "pipe"]
  });

  if (result.status !== 0) {
    throw new Error(
      [
        "browser-harness proof failed",
        `exit=${result.status}`,
        result.stdout.trim(),
        result.stderr.trim(),
        serverOutput.trim()
      ]
        .filter(Boolean)
        .join("\n")
    );
  }

  const parsed = JSON.parse(result.stdout.trim().split(/\r?\n/).at(-1) ?? "{}");
  if (parsed.ok !== true) {
    throw new Error(`browser-harness proof returned non-ok result: ${JSON.stringify(parsed, null, 2)}`);
  }

  console.log(JSON.stringify(parsed, null, 2));
} finally {
  server.kill();
}

async function waitForServer(url) {
  const deadline = Date.now() + 60_000;
  let lastError;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
      lastError = new Error(`unexpected status ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`Timed out waiting for web proof server at ${url}: ${String(lastError)}`);
}

function buildBrowserHarnessProof(url) {
  const bootstrap = {
    initialSnapshot: {
      tenantName: "Browser Proof Tenant",
      packageName: "Installed Package",
      requiredProviders: ["OpenAI"],
      optionalProviders: ["customer-owned storage"],
      artifactTtlHours: 24,
      role: "member",
      workflows: [
        {
          id: "wf_connect_first_workflow",
          name: "Connect-first onboarding brief",
          providerKind: "openai",
          enabled: true,
          startEnabled: true
        }
      ],
      artifacts: [
        {
          id: "artifact-browser-proof",
          filename: "browser-proof-brief.md",
          artifactType: "markdown",
          expiresAt: "2026-07-02T00:00:00.000Z"
        },
        {
          id: "artifact-browser-empty",
          filename: "empty-state-check.md",
          artifactType: "markdown",
          expiresAt: "2026-07-02T00:00:00.000Z"
        }
      ],
      resultApprovalStates: {
        "artifact-browser-proof": "Approved"
      },
      providerConnections: [
        {
          providerKind: "openai",
          label: "OpenAI",
          connected: true,
          required: true
        }
      ],
      storageConnectors: [],
      platformLoad: {
        level: "light",
        summary: "Light traffic",
        detail: "Browser proof shell should load quickly."
      }
    }
  };

  return String.raw`
import json
import time

base_url = ${JSON.stringify(url)}
storage_key = ${JSON.stringify(RESULT_APPROVAL_STATES_STORAGE_KEY)}
stale_storage = {"artifact-browser-proof": "Revision needed", "local-only": "Approved"}
bootstrap = json.loads(${JSON.stringify(JSON.stringify(bootstrap))})

new_tab(base_url + "/")
wait_for_load()
js("localStorage.setItem(" + json.dumps(storage_key) + ", " + json.dumps(json.dumps(stale_storage)) + ")")

cdp("Page.enable")
cdp(
    "Page.addScriptToEvaluateOnNewDocument",
    source="window.__WF_DASHBOARD_BOOTSTRAP__ = " + json.dumps(bootstrap) + ";"
)
cdp("Page.navigate", url=base_url + "/results")
wait_for_load()
time.sleep(1)

first_results = json.loads(js("""
(() => JSON.stringify({
  url: location.href,
  hasResultsPage: document.querySelector('[data-testid="page-results"]') !== null,
  text: document.body ? document.body.innerText : "",
  storage: localStorage.getItem("wealth-factory.resultApprovalStates.v1")
}))()
"""))

js("document.querySelector('[data-testid=\"nav-home\"]')?.click()")
time.sleep(0.5)
js("document.querySelector('[data-testid=\"nav-results\"]')?.click()")
time.sleep(0.5)

second_results = json.loads(js("""
(() => JSON.stringify({
  url: location.href,
  hasResultsPage: document.querySelector('[data-testid="page-results"]') !== null,
  text: document.body ? document.body.innerText : "",
  storage: localStorage.getItem("wealth-factory.resultApprovalStates.v1")
}))()
"""))

def accepted(state):
    text = state["text"]
    return (
        state["hasResultsPage"]
        and "Approved" in text
        and "Download readiness: Ready to download" in text
        and "browser-proof-brief.md" in text
        and '"artifact-browser-proof":"Approved"' in (state["storage"] or "").replace(" ", "")
        and '"local-only":"Approved"' in (state["storage"] or "").replace(" ", "")
    )

summary = {
    "ok": accepted(first_results) and accepted(second_results) and "Empty State Check" in first_results["text"],
    "phase": "dashboard_result_approval_browser_bootstrap_precedence",
    "browserHarnessUsed": True,
    "baseUrl": base_url,
    "checks": {
        "staleLocalStorageSeeded": stale_storage,
        "backendBootstrapState": bootstrap["initialSnapshot"]["resultApprovalStates"],
        "firstResultsAccepted": accepted(first_results),
        "navigationRoundTripAccepted": accepted(second_results),
        "emptyApprovalPathRendered": "Empty State Check" in first_results["text"],
    }
}
print(json.dumps(summary))
`;
}

function resolveBrowserHarnessCommand() {
  if (process.env.BROWSER_HARNESS_COMMAND) {
    return process.env.BROWSER_HARNESS_COMMAND;
  }

  const localWindowsHarness = "E:\\REPOS 2\\browser-harness\\.venv\\Scripts\\browser-harness.exe";
  return existsSync(localWindowsHarness) ? localWindowsHarness : "browser-harness";
}
