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

  it("records the current local launch-gate validation as latest", () => {
    expect(latestPhaseCurrentBlock).toContain(
      "Closed the bounded local launch-gate validation after the CEO-governed multi-lane dispatch fix"
    );
    expect(latestPhaseCurrentBlock).toContain(
      "Sonnet was consulted in headless mode for consideration only"
    );
    expect(latestPhaseCurrentBlock).toContain(
      "`npm test` (`145` files passed, `1292` tests passed, `14` skipped)"
    );
    expect(latestPhaseCurrentBlock).toContain(
      "worker/internal claim tokens out of tenant-facing export artifacts"
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
