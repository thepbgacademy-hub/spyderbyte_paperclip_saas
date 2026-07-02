import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

import { describe, expect, it } from "vitest";

const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as { scripts: Record<string, string> };
const scriptPath = "scripts/prove-live-dashboard-browser-journey.mjs";
const script = readFileSync(scriptPath, "utf8");

describe("live dashboard browser journey proof", () => {
  it("is exposed as a dry-run-first browser-harness proof for the public board journey", () => {
    expect(packageJson.scripts["prove:live-dashboard-browser-journey"]).toBe(`node ${scriptPath}`);
    expect(script).toContain("browser-harness");
    expect(script).toContain("dashboard_browser_journey_planned");
    expect(script).toContain("dashboard_browser_journey_verified");
    expect(script).toContain("/board?workflowId=");
    expect(script).toContain("wf_connect_first_workflow");
    expect(script).toContain("method: \"GET\"");
    expect(script).toContain("resultApprovalStates");
    expect(script).toContain("page-board");
    expect(script).toContain("nav-results");
    expect(script).toContain("page-results");
    expect(script).not.toContain("/api/dashboard/runs");
    expect(script).not.toContain("method: \"POST\"");
  });

  it("dry-runs without loading default stage secrets or printing supplied session tokens", () => {
    const result = spawnSync(process.execPath, [
      scriptPath,
      "--base-url",
      "https://explicit-api.example.test",
      "--portal-origin",
      "https://explicit-portal.example.test",
      "--session-token",
      "secret-session"
    ], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        WF_STAGE_API_ORIGIN: "",
        WF_STAGE_PORTAL_ORIGIN: "",
        WF_STAGE_ENV_FILE: "",
        NODE_OPTIONS: ""
      }
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('"dryRun": true');
    expect(result.stdout).toContain('"apiOrigin": "https://explicit-api.example.test"');
    expect(result.stdout).toContain('"portalOrigin": "https://explicit-portal.example.test"');
    expect(result.stdout).toContain('"envFilePath": null');
    expect(result.stdout).toContain('"sessionTokenSource": "provided"');
    expect(result.stdout).not.toContain("secret-session");
  });
});
