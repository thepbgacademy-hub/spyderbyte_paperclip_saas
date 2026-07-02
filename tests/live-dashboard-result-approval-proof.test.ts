import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

import { describe, expect, it } from "vitest";

const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as { scripts: Record<string, string> };
const script = readFileSync("scripts/prove-live-dashboard-result-approval.mjs", "utf8");

describe("live dashboard result approval proof", () => {
  it("is exposed as a dry-run-first read-only proof command", () => {
    expect(packageJson.scripts["prove:live-dashboard-result-approval"]).toBe("node scripts/prove-live-dashboard-result-approval.mjs");
    expect(script).toContain("/api/dashboard");
    expect(script).toContain("method: \"GET\"");
    expect(script).toContain("dashboard_result_approval_live_read_planned");
    expect(script).toContain("dashboard_result_approval_live_read_verified");
    expect(script).toContain("resultApprovalStates");
    expect(script).toContain("DRY RUN: no network calls made");
    expect(script).not.toContain("/api/dashboard/runs");
    expect(script).not.toContain("method: \"POST\"");
  });

  it("dry-runs without printing supplied session tokens", () => {
    const result = spawnSync(process.execPath, [
      "scripts/prove-live-dashboard-result-approval.mjs",
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
        WF_STAGE_ENV_FILE: ""
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

  it("parses boolean execute without swallowing the next named option", () => {
    expect(script).toContain("function parseProofArgs");

    const result = spawnSync(process.execPath, [
      "scripts/prove-live-dashboard-result-approval.mjs",
      "--execute",
      "--base-url",
      "https://explicit-api.example.test",
      "--portal-origin",
      "https://explicit-portal.example.test"
    ], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        WF_STAGE_ENV_FILE: "tests/fixtures/nonexistent-stage-proof.env",
        WF_STAGE_API_ORIGIN: "",
        WF_STAGE_PORTAL_ORIGIN: "",
        WF_STAGE_PROOF_TENANT_ID: "",
        WF_STAGE_PROOF_USER_ID: "",
        NODE_OPTIONS: ""
      }
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr + result.stdout).toContain("--tenant and --user are required");
    expect(result.stderr + result.stdout).not.toContain("WF_STAGE_API_ORIGIN is required");
  });
});
