import { execFileSync } from "node:child_process";

import { describe, expect, it } from "vitest";

const repoRoot = "E:/REPOS/spyderbyte_paperclip_saas";

describe(".gitignore generated JS mirror fence", () => {
  it("ignores generated JS mirrors while keeping real proof mjs files visible", () => {
    const ignoredSamples = [
      "src/api/runtime-server.js",
      "tests/live-run-drive.test.js",
      "apps/web/src/App.js",
      "apps/web/tests/e2e/workflow.spec.js",
      "apps/web/playwright.config.js",
      "apps/web/playwright.live.config.js"
    ];

    for (const sample of ignoredSamples) {
      expect(isIgnored(sample), `expected ${sample} to be ignored`).toBe(true);
    }

    expect(isIgnored("scripts/prove-live-harness-export.mjs")).toBe(false);
    expect(isIgnored("scripts/cleanup-stale-bound-runs.mjs")).toBe(false);
  });
});

function isIgnored(relativePath: string): boolean {
  try {
    execFileSync("git", ["check-ignore", relativePath], {
      cwd: repoRoot,
      stdio: "pipe"
    });
    return true;
  } catch {
    return false;
  }
}
