import { createRequire } from "node:module";

import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const {
  buildProofOutput,
  parseModeArg,
  shouldInspectQueueState,
  updateSuccessWindow
} = require("../scripts/lib/prove-live-fairness-support.mjs");

describe("prove-live-fairness support helpers", () => {
  it("marks global fairness capture as analysis-pending even when the drain summary succeeded", () => {
    const modeConfig = parseModeArg("global-fairness");
    const output = buildProofOutput({
      modeConfig,
      summary: { ok: true, phase: "burst_drain_observed" },
      requests: [],
      snapshots: [],
      queueSnapshots: [],
      observationDurationMs: 120000,
      postSuccessObservationMs: 60000
    });

    expect(output).toMatchObject({
      ok: false,
      phase: "global_fairness_analysis_required",
      analysisPending: true,
      captureOk: true,
      requestedMode: "global-fairness",
      summaryMode: "drain",
      observationDurationMs: 120000,
      postSuccessObservationMs: 60000
    });
  });

  it("requires a full post-success window before finalizing", () => {
    const first = updateSuccessWindow({
      summaryOk: true,
      nowMs: 1000,
      postSuccessObservationMs: 60000,
      successObservedAt: null
    });
    expect(first).toEqual({
      successObservedAt: 1000,
      readyToFinalize: false
    });

    const second = updateSuccessWindow({
      summaryOk: true,
      nowMs: 61001,
      postSuccessObservationMs: 60000,
      successObservedAt: first.successObservedAt
    });
    expect(second).toEqual({
      successObservedAt: 1000,
      readyToFinalize: true
    });

    const reset = updateSuccessWindow({
      summaryOk: false,
      nowMs: 62000,
      postSuccessObservationMs: 60000,
      successObservedAt: second.successObservedAt
    });
    expect(reset).toEqual({
      successObservedAt: null,
      readyToFinalize: false
    });
  });

  it("skips per-run queue inspection after a run already produced progress", () => {
    expect(
      shouldInspectQueueState({
        runStatus: "queued",
        previousObservation: null
      })
    ).toBe(true);

    expect(
      shouldInspectQueueState({
        runStatus: "queued",
        previousObservation: {
          observedFirstProgressAt: "2026-05-20T06:00:01.000Z"
        }
      })
    ).toBe(false);

    expect(
      shouldInspectQueueState({
        runStatus: "running",
        previousObservation: null
      })
    ).toBe(false);
  });
});
