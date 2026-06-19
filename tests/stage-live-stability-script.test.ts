import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const script = readFileSync("scripts/prove-stage-live-stability.mjs", "utf8");
const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as { scripts: Record<string, string> };

describe("stage live stability runner script", () => {
  it("runs the bounded stage proof, fairness proof, and soak proof sequence with a dry-run mode", () => {
    expect(script).toContain("buildStageStabilityPlan");
    expect(script).toContain("--dry-run");
    expect(script).toContain("npm run prove:stage-live");
    expect(script).toContain("npm run prove:live-fairness");
    expect(script).toContain("npm run prove:live-soak-capacity");
    expect(script).toContain("runStageStabilityPlan");
    expect(script).not.toContain("resolveRemoteWorkflowTemplateIdsForLanes");
    expect(script).not.toContain("workflow_templates");
  });

  it("is exposed as an npm proof command", () => {
    expect(packageJson.scripts["prove:stage-stability"]).toBe("node scripts/prove-stage-live-stability.mjs");
  });

  it("executes the wrapper in dry-run mode and emits a planned sequence", () => {
    const stdout = execFileSync(
      process.execPath,
      ["scripts/prove-stage-live-stability.mjs", "--dry-run"],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          WF_STAGE_API_ORIGIN: "https://wf-api.spyderbyte.cloud",
          WF_STAGE_PORTAL_ORIGIN: "https://www.spyderbyte.cloud",
          WF_PORTAL_SESSION_COOKIE_NAME: "wf_portal_session",
          SUPABASE_DB_URL: "postgresql://demo:secret@supabase-db:5432/postgres",
          VPS2_USER: "deploy",
          VPS2_HOST: "187.77.19.83"
        },
        encoding: "utf8"
      }
    );

    const parsed = JSON.parse(stdout);
    expect(parsed).toMatchObject({
      ok: true,
      dryRun: true,
      sequence: [
        "npm run prove:stage-live",
        "npm run prove:live-fairness",
        "npm run prove:live-soak-capacity"
      ]
    });
  });
});
