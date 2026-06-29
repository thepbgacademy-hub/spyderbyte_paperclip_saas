import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("live attention cycle proof script", () => {
  it("stays on the authenticated board seam and asserts the explicit stale_contract rejection", () => {
    const script = readFileSync("scripts/prove-live-attention-cycle.mjs", "utf8");

    expect(script).toContain("parseStageProofArgs");
    expect(script).toContain("loadScriptEnv");
    expect(script).toContain("proveLiveAttentionCycleRefresh");
    expect(script).toContain("wf_connect_first_workflow");
    expect(script).toContain("pricing_review");
    expect(script).toContain("stale_contract");
    expect(script).toContain("createRuntimeSessionToken");
    expect(script).not.toContain("ssh ");
    expect(script).not.toContain("scp ");
    expect(script).not.toContain("docker exec");
  });
});
