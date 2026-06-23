import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const rootHandoff = readFileSync("HANDOFF.md", "utf8");
const handoff = readFileSync("wf-harness/HANDOFF.md", "utf8");
const latestPhase = handoff.split("## Latest Phase")[1]?.split("## Key Design Commitments")[0] ?? "";
const todo = readFileSync("wf-harness/TODO.md", "utf8");
const currentNextSlice = todo.split("## Current Next Slice")[1]?.split("## Historical Next Slice Notes")[0] ?? "";

describe("handoff board-surface wording", () => {
  it("keeps one authoritative handoff path after the repo-noise cleanup", () => {
    expect(rootHandoff).toContain("`wf-harness/HANDOFF.md` is the authoritative handoff path");
    expect(rootHandoff).toContain("Phase R1");
    expect(rootHandoff).not.toContain("## Status");
    expect(rootHandoff).not.toContain("## Next Build Order");
  });

  it("records the completed realignment phases without reopening product scope", () => {
    expect(latestPhase).toContain(
      "Phase R2 is now closed"
    );
    expect(latestPhase).toContain(
      "GitNexus preflight"
    );
    expect(latestPhase).toContain(
      "Phase R4 is now closed"
    );
    expect(latestPhase).toContain(
      "HarnessBoardActionPanel.tsx"
    );
    expect(latestPhase).toContain(
      "Phase R5 is now closed"
    );
    expect(latestPhase).toContain(
      "runtime-native-execution.ts"
    );
    expect(latestPhase).toContain(
      "Phase R6 is now closed"
    );
    expect(latestPhase).toContain(
      "legacy-bounded adapters"
    );
    expect(latestPhase).toContain(
      "`npx vitest run tests/worker-runtime.test.ts tests/runtime-provider-fallback.test.ts`"
    );
  });

  it("records the completed R2 through R6 checklist in the current next-slice section", () => {
    expect(currentNextSlice).toContain(
      "Phase R2: Proof and Tooling Surface Reduction"
    );
    expect(currentNextSlice).toContain(
      "scripts/prove-provider-credential-lifecycle.mjs"
    );
    expect(currentNextSlice).toContain(
      "Phase R4: Board UI Decomposition and Simplification"
    );
    expect(currentNextSlice).toContain(
      "Phase R5: Runtime Hotspot Reduction"
    );
    expect(currentNextSlice).toContain(
      "Phase R6: Paperclip Seam Freeze"
    );
    expect(currentNextSlice).not.toContain(
      "Close the bounded stage native-execution runner proof gap"
    );
  });
});
