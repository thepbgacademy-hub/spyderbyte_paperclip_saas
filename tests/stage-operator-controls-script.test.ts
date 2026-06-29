import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const script = readFileSync("scripts/prove-stage-operator-controls.mjs", "utf8");
const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as { scripts: Record<string, string> };

describe("stage operator controls proof script", () => {
  it("is exposed as a dry-run-first npm proof command", () => {
    expect(packageJson.scripts["prove:stage-operator-controls"]).toBe("node scripts/prove-stage-operator-controls.mjs");
    expect(script).toContain("buildStageOperatorControlsProbePlan");
    expect(script).toContain("--execute-read-only");
    expect(script).toContain("DRY RUN: no network calls made");
  });

  it("executes in dry-run mode without a token or network call", () => {
    const stdout = execFileSync(process.execPath, ["scripts/prove-stage-operator-controls.mjs"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        WF_STAGE_API_ORIGIN: "https://wf-api.spyderbyte.cloud",
        WF_STAGE_OPERATOR_TENANT_ID: "tenant-1"
      },
      encoding: "utf8"
    });

    const parsed = JSON.parse(stdout);
    expect(parsed).toMatchObject({
      ok: true,
      dryRun: true,
      message: "DRY RUN: no network calls made",
      plan: {
        method: "GET",
        endpoint: "https://wf-api.spyderbyte.cloud/api/operator/tenants/tenant-1/jobs/dead-letters",
        executeReadOnly: false
      }
    });
  });

  it("fails closed before network execution when execute-read-only is missing a token", () => {
    expect(() =>
      execFileSync(process.execPath, ["scripts/prove-stage-operator-controls.mjs", "--execute-read-only"], {
        cwd: process.cwd(),
        env: {
          ...process.env,
          WF_STAGE_API_ORIGIN: "https://wf-api.spyderbyte.cloud",
          WF_STAGE_OPERATOR_TENANT_ID: "tenant-1",
          WF_STAGE_OPERATOR_BEARER_TOKEN: ""
        },
        encoding: "utf8",
        stdio: "pipe"
      })
    ).toThrow(/WF_STAGE_OPERATOR_BEARER_TOKEN is required/);
  });
});
