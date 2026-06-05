import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const script = readFileSync("scripts/inspect-live-workflow-run.mjs", "utf8");

describe("inspect live workflow run script", () => {
  it("fails the caller when live-run verification is not ok", () => {
    expect(script).toMatch(/if \(!summary\.ok\)\s*\{\s*process\.exitCode = 1;\s*\}/);
  });
});
