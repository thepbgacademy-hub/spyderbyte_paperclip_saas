import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const rootHandoff = readFileSync("HANDOFF.md", "utf8");
const handoff = readFileSync("wf-harness/HANDOFF.md", "utf8");
const obsidianDesign = readFileSync("wf-harness/docs/2026-06-29-obsidian-long-memory-integration-design.md", "utf8");
const latestPhase = handoff.split("## Latest Phase")[1]?.split("## Key Design Commitments")[0] ?? "";
const latestPhaseCurrentBlock = latestPhase.trimStart().split(/\r?\n\r?\n/)[0] ?? "";
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
    expect(handoff).toContain(
      "Phase R2 is now closed"
    );
    expect(handoff).toContain(
      "GitNexus preflight"
    );
    expect(handoff).toContain(
      "Phase R4 is now closed"
    );
    expect(handoff).toContain(
      "HarnessBoardActionPanel.tsx"
    );
    expect(handoff).toContain(
      "Phase R5 is now closed"
    );
    expect(handoff).toContain(
      "runtime-native-execution.ts"
    );
    expect(handoff).toContain(
      "Phase R6 is now closed"
    );
    expect(handoff).toContain(
      "legacy-bounded adapters"
    );
    expect(handoff).toContain(
      "`npx vitest run tests/worker-runtime.test.ts tests/runtime-provider-fallback.test.ts`"
    );
  });

  it("records the completed operator-controls integration proof as latest", () => {
    expect(latestPhaseCurrentBlock).toContain(
      "Closed the bounded local operator-controls integration proof harness"
    );
    expect(latestPhaseCurrentBlock).toContain(
      "Sonnet was consulted in headless mode for consideration only"
    );
    expect(latestPhaseCurrentBlock).toContain(
      "Added `tests/operator-controls-integration.test.ts` to prove the real local stack path"
    );
    expect(latestPhaseCurrentBlock).toContain(
      "continue to defer job inspect/retry/cancel, secret rotate/revoke, cancel-runs-by-secret-ref, Paperclip disable semantics, and operator UI"
    );
    expect(latestPhase).toContain(
      "Closed the bounded isolated Wealth Factory stage-refresh/parity slice on VPS 2"
    );
  });

  it("keeps the current next-slice section pointed at completed bounded launch-readiness slices", () => {
    expect(currentNextSlice.trimStart()).toContain(
      "- [x] Refresh only the isolated Wealth Factory stage lane to prove live parity with the current branch."
    );
    expect(currentNextSlice).toContain(
      "- [x] Complete the post-stage-refresh commit/reindex closeout."
    );
    expect(currentNextSlice).toContain(
      "Commit and push the completed stage-refresh slice at `d73eb35`."
    );
    expect(currentNextSlice).toContain(
      "- [x] Harden the public board attention-recovery copy without widening runtime semantics, export plumbing, or deployment topology."
    );
    expect(currentNextSlice).toContain(
      "resolve the live board action instead of restarting workers, replaying stale action tokens, or bypassing the engine-owned contract"
    );
    expect(todo).toContain(
      "Phase R2: Proof and Tooling Surface Reduction"
    );
    expect(todo).toContain(
      "scripts/prove-provider-credential-lifecycle.mjs"
    );
    expect(todo).toContain(
      "Phase R4: Board UI Decomposition and Simplification"
    );
    expect(todo).toContain(
      "Phase R5: Runtime Hotspot Reduction"
    );
    expect(todo).toContain(
      "Phase R6: Paperclip Compatibility Bounding"
    );
    expect(currentNextSlice).not.toContain(
      "Close the bounded stage native-execution runner proof gap"
    );
  });

  it("records the Obsidian long-memory split without making Obsidian runtime truth", () => {
    expect(todo).toContain(
      "Design the Obsidian long-memory integration"
    );
    expect(todo).toContain(
      "Keep Obsidian limited to tenant-owned long memory promoted through `governance_history_export` and `package_bundle_export`"
    );
    expect(obsidianDesign).toContain(
      "This note closes the local-only Obsidian long-memory design phase"
    );
    expect(obsidianDesign).toContain(
      "Wealth Factory owns live execution truth"
    );
    expect(obsidianDesign).toContain(
      "Obsidian must not become the source of truth for live execution-critical state"
    );
    expect(obsidianDesign).toContain(
      "Only approved export candidates may promote Wealth Factory records into tenant-owned Obsidian memory"
    );
  });
});
