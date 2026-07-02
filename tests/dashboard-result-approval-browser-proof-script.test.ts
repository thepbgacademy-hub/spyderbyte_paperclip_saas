import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const script = readFileSync("scripts/prove-dashboard-result-approval-browser.mjs", "utf8");
const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as { scripts: Record<string, string> };

describe("dashboard result approval browser proof script", () => {
  it("uses browser-harness to prove bootstrapped backend approval state wins over stale browser storage", () => {
    expect(packageJson.scripts["prove:dashboard-result-approval-browser"]).toBe(
      "node scripts/prove-dashboard-result-approval-browser.mjs"
    );
    expect(script).toContain("browser-harness");
    expect(script).toContain("RESULT_APPROVAL_STATES_STORAGE_KEY");
    expect(script).toContain("Page.addScriptToEvaluateOnNewDocument");
    expect(script).toContain('"artifact-browser-proof": "Approved"');
    expect(script).toContain('"artifact-browser-proof": "Revision needed"');
    expect(script).toContain("Download readiness: Ready to download");
    expect(script).toContain("page-results");
    expect(script).toContain("nav-home");
    expect(script).toContain("nav-results");
  });
});
