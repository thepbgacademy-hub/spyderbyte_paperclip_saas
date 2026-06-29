import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("live dashboard run proof script", () => {
  it("reads the authoritative current secret ref instead of falling back to stale bound provider context values", () => {
    const script = readFileSync("scripts/prove-live-dashboard-run.mjs", "utf8");

    expect(script).toContain("secrets.secret_ref as current_secret_ref");
    expect(script).toContain("secrets.revoked_at is null");
    expect(script).not.toContain("||\n                (typeof entry.secretRef === \"string\" ? entry.secretRef : \"\")");
  });
});
