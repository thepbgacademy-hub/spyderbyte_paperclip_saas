import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const handoff = readFileSync("wf-harness/HANDOFF.md", "utf8");
const latestPhase = handoff.split("## Latest Phase")[1]?.split("## Key Design Commitments")[0] ?? "";
const todo = readFileSync("wf-harness/TODO.md", "utf8");
const currentNextSlice = todo.split("## Current Next Slice")[1]?.split("## V1 Build Targets")[0] ?? "";

describe("handoff board-surface wording", () => {
  it("describes the current board page split without claiming older historical wording was removed globally", () => {
    expect(handoff).toContain(
      "the overall board page still shows `Recent decisions`, `Follow-through`, and `Completion package`, while the compact `harness-board` cockpit surface stays free of the removed `memoryBoundary` explainer and those heavier context panels."
    );
    expect(latestPhase).not.toContain(
      "Restored non-memory board context that had been swept out during the collapse work: `Recent decisions`, `Follow-through`, and `Completion package` are visible again on the main board surface without reopening the removed deferred memory/export explainer."
    );
    expect(latestPhase).not.toContain(
      "Updated the board UI proof so deferred export-delivery controls are now explicitly absent from the main board surface"
    );
  });

  it("records the stage native-execution runner proof phase without widening launch posture", () => {
    expect(latestPhase).toContain(
      "bounded stage native-execution runner proof gap"
    );
    expect(latestPhase).toContain(
      "`tests/stage-live-native-execution-runner.test.ts`"
    );
    expect(latestPhase).toContain(
      "`scripts/lib/stage-live-native-execution-runner.mjs`"
    );
    expect(latestPhase).toContain(
      "`npm run build -- --pretty false`"
    );
    expect(latestPhase).toContain(
      "`npm run prove:stage-live-native-execution`"
    );
    expect(latestPhase).toContain(
      "`wf_connect_first_workflow`, `wf_tax_strategy`, and `wf_package_followup`"
    );
    expect(latestPhase).toContain(
      "Kept the seam anti-drift and no-scope-creep on purpose"
    );
    expect(latestPhase).toContain(
      "Kept `api.spyderbyte.cloud` unchanged on purpose"
    );
    expect(latestPhase).toContain(
      "validated the isolated Wealth Factory lane only"
    );
    expect(latestPhase).toContain(
      "The next continuation point is to isolate the next meaningful bounded build slice from the still-critical working tree"
    );
  });

  it("records the matching bounded runner-proof claim in TODO without silently folding later historical items into this pass", () => {
    expect(currentNextSlice).toContain(
      "Close the bounded stage native-execution runner proof gap without reopening broader stage-stability, board-contract, or launch-lane scope."
    );
    expect(currentNextSlice).toContain(
      "`gitnexus status` stayed current at commit `7370811`"
    );
    expect(currentNextSlice).toContain(
      "execution-level behavioral proof for `scripts/prove-stage-live-native-execution.mjs`"
    );
    expect(currentNextSlice).toContain(
      "`npm run build -- --pretty false`"
    );
    expect(currentNextSlice).toContain(
      "`npm run prove:stage-live-native-execution` against `wf-api.spyderbyte.cloud`"
    );
    expect(currentNextSlice).toContain(
      "Keep `api.spyderbyte.cloud` unchanged; this acceptance phase validated the isolated Wealth Factory lane only."
    );
    expect(currentNextSlice).toContain(
      "the older completed items that follow in this section remain historical branch context from prior bounded slices"
    );
  });
});
