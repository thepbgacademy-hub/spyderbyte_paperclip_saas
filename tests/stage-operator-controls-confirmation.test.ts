import { existsSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as { scripts: Record<string, string> };
const confirmationPath = "wf-harness/docs/2026-06-29-stage-operator-controls-live-confirmation.md";

describe("stage operator controls live confirmation gate", () => {
  it("keeps the live read-only probe out of default test and stage stability script chains", () => {
    expect(packageJson.scripts.test).not.toContain("prove:stage-operator-controls");
    expect(packageJson.scripts["prove:stage-stability"]).not.toContain("prove:stage-operator-controls");
    expect(packageJson.scripts["prove:stage-live"]).not.toContain("prove:stage-operator-controls");
    expect(packageJson.scripts["prove:stage-live-native-execution"]).not.toContain("prove:stage-operator-controls");
  });

  it("records the manual live read-only confirmation posture without embedding secrets", () => {
    expect(existsSync(confirmationPath)).toBe(true);
    const doc = readFileSync(confirmationPath, "utf8");

    expect(doc).toContain("npm run prove:stage-operator-controls -- --execute-read-only");
    expect(doc).toContain("GET /api/operator/tenants/:tenant/jobs/dead-letters");
    expect(doc).toContain("WF_STAGE_OPERATOR_BEARER_TOKEN");
    expect(doc).toContain("Do not commit bearer tokens");
    expect(doc).toContain("try {");
    expect(doc).toContain("finally {");
    expect(doc).toContain("Remove-Item Env:\\WF_STAGE_OPERATOR_BEARER_TOKEN -ErrorAction SilentlyContinue");
    expect(doc).toContain("not part of `npm test` or `npm run prove:stage-stability`");
    expect(doc).not.toMatch(/Bearer\s+[A-Za-z0-9._-]{8,}/);
  });
});
