import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const handoff = readFileSync("wf-harness/HANDOFF.md", "utf8");

describe("handoff board-surface wording", () => {
  it("describes the current board page split without reintroducing the old main-surface contradiction", () => {
    expect(handoff).toContain(
      "the overall board page still shows `Recent decisions`, `Follow-through`, and `Completion package`, while the compact `harness-board` cockpit surface stays free of the removed `memoryBoundary` explainer and those heavier context panels."
    );
    expect(handoff).not.toContain(
      "Restored non-memory board context that had been swept out during the collapse work: `Recent decisions`, `Follow-through`, and `Completion package` are visible again on the main board surface without reopening the removed deferred memory/export explainer."
    );
    expect(handoff).not.toContain(
      "Updated the board UI proof so deferred export-delivery controls are now explicitly absent from the main board surface"
    );
  });

  it("records the isolated-host live harness-board proof as closed evidence without claiming a shared-host cutover", () => {
    expect(handoff).toContain(
      "the repo-side `npm run prove:stage-live` command passed remote runtime preflight, authenticated shell smoke, and live Playwright harness-board proof across `wf_connect_first_workflow`, `wf_tax_strategy`, and `wf_package_followup`."
    );
    expect(handoff).toContain(
      "The repo now also has a stage-owned stability wrapper, `npm run prove:stage-stability`, which keeps the low-level fairness and soak primitives generic while codifying the isolated `wf-api.spyderbyte.cloud` defaults, the stage-owned focus-container set, and a safe `--dry-run` planning mode."
    );
    expect(handoff).toContain(
      "That stage-owned focus-container set is limited to `wf-stage-api`, `wf-stage-worker`, and `wf-stage-web` by default; it does not widen the verdict to unrelated shared-host containers."
    );
    expect(handoff).toContain(
      "keep `api.spyderbyte.cloud` unchanged until there is an explicit operator decision to cut over or to keep the isolated host as the permanent Wealth Factory public API lane."
    );
    expect(handoff).not.toContain(
      "Treat live execution of that proof as the next bounded shipping gate, not as already-closed evidence."
    );
  });
});
