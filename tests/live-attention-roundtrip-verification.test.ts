import { createRequire } from "node:module";

import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { verifyWaitingRoundTrip } = require("../scripts/lib/live-attention-roundtrip-verification.mjs") as {
  verifyWaitingRoundTrip(input: {
    workflowId: string;
    nativeVerification?: { ok?: boolean };
    advancementProof?: {
      phase?: string;
      outcomeEvent?: {
        payload?: {
          continuitySummary?: string;
          outcomeState?: string;
          postOutcomeActionKind?: string;
        };
      };
    };
    waitingAttentionResolution?: { ok?: boolean; phase?: string; notes?: string[] };
    roundTripProof?: {
      ok?: boolean;
      phase?: string;
      notes?: string[];
      outcomeEvent?: {
        payload?: {
          outcomeState?: string;
          postOutcomeActionKind?: string;
          continuitySummary?: string;
        };
      };
    };
  }): {
    ok: boolean;
    phase: string;
    notes: string[];
  };
};

describe("live attention round-trip verification", () => {
  it("verifies the round trip for wf_connect_first_workflow after a truthful waiting leg and successful redispatch", () => {
    expect(
      verifyWaitingRoundTrip({
        workflowId: "wf_connect_first_workflow",
        nativeVerification: { ok: true },
        advancementProof: { phase: "native_waiting_reached" },
        waitingAttentionResolution: { ok: true, phase: "waiting_attention_resolved" },
        roundTripProof: {
          ok: true,
          phase: "native_done_reached",
          outcomeEvent: {
            payload: {
              outcomeState: "done",
              postOutcomeActionKind: "none",
              continuitySummary: "The bounded connect-first workflow completed after the waiting lane was resolved."
            }
          }
        }
      })
    ).toEqual({
      ok: true,
      phase: "round_trip_verified",
      notes: [
        "The first native execution leg reached a truthful attention state.",
        "The live board returned a bounded resolve-attention contract and accepted a native attention resolution.",
        "A fresh native redispatch/advancement was proven after the board action."
      ]
    });
  });

  it("verifies the round trip for wf_connect_first_workflow after a truthful blocked leg and successful redispatch", () => {
    expect(
      verifyWaitingRoundTrip({
        workflowId: "wf_connect_first_workflow",
        nativeVerification: { ok: true },
        advancementProof: {
          phase: "native_blocked_reached",
          outcomeEvent: {
            payload: {
              outcomeState: "blocked",
              postOutcomeActionKind: "await_unblock",
              continuitySummary: "The connect-first lane is blocked until the operator resolves the bounded provider issue."
            }
          }
        },
        waitingAttentionResolution: { ok: true, phase: "native_attention_resolved" },
        roundTripProof: {
          ok: true,
          phase: "native_done_reached",
          outcomeEvent: {
            payload: {
              outcomeState: "done",
              postOutcomeActionKind: "none",
              continuitySummary: "The bounded connect-first workflow completed after the blocked lane was resolved."
            }
          }
        }
      })
    ).toEqual({
      ok: true,
      phase: "round_trip_verified",
      notes: [
        "The first native execution leg reached a truthful attention state.",
        "The live board returned a bounded resolve-attention contract and accepted a native attention resolution.",
        "A fresh native redispatch/advancement was proven after the board action."
      ]
    });
  });

  it("fails honestly for wf_connect_first_workflow when the first native leg never reaches waiting or blocked attention", () => {
    expect(
      verifyWaitingRoundTrip({
        workflowId: "wf_connect_first_workflow",
        nativeVerification: { ok: true },
        advancementProof: {
          phase: "native_done_reached",
          outcomeEvent: {
            payload: {
              outcomeState: "done",
              postOutcomeActionKind: "none",
              continuitySummary: "The connect-first workflow completed before surfacing any attention seam."
            }
          }
        }
      })
    ).toEqual({
      ok: false,
      phase: "native_attention_not_reached",
      notes: [
        "The first native advancement leg did not land in a waiting or blocked attention state, so the bounded resolve-attention round-trip cannot be proven honestly."
      ]
    });
  });

  it("fails honest when wf_tax_strategy immediately re-enters await_unblock after an unblock action", () => {
    expect(
      verifyWaitingRoundTrip({
        workflowId: "wf_tax_strategy",
        nativeVerification: { ok: true },
        advancementProof: {
          phase: "native_blocked_reached",
          outcomeEvent: {
            payload: {
              continuitySummary:
                "Tax Strategy Workflow tax strategy review lane for CFO: Review the founder tax posture needs an explicit unblock action."
            }
          }
        },
        waitingAttentionResolution: { ok: true },
        roundTripProof: {
          ok: true,
          phase: "native_blocked_reached",
          outcomeEvent: {
            payload: {
              outcomeState: "blocked",
              postOutcomeActionKind: "await_unblock",
              continuitySummary:
                "Tax Strategy Workflow tax strategy review lane for CFO: Review the founder tax posture needs an explicit unblock action."
            }
          }
        }
      })
    ).toEqual({
      ok: false,
      phase: "round_trip_reblocked_same_dependency",
      notes: [
        "Post-unblock rerun returned await_unblock on dependency: founder_tax_posture_documents.",
        "The board action succeeded, but the tax strategy lane truthfully re-entered the same unblock path, so the round trip is not verified."
      ]
    });
  });

  it("fails honest with a distinct phase when the unblock rerun returns a different tax dependency", () => {
    expect(
      verifyWaitingRoundTrip({
        workflowId: "wf_tax_strategy",
        nativeVerification: { ok: true },
        advancementProof: {
          phase: "native_blocked_reached",
          outcomeEvent: {
            payload: {
              continuitySummary:
                "Tax Strategy Workflow tax strategy review lane for CFO: Review the founder tax posture needs an explicit unblock action."
            }
          }
        },
        waitingAttentionResolution: { ok: true },
        roundTripProof: {
          ok: true,
          phase: "native_blocked_reached",
          outcomeEvent: {
            payload: {
              outcomeState: "blocked",
              postOutcomeActionKind: "await_unblock",
              continuitySummary:
                "Tax Strategy Workflow tax strategy review lane for CFO needs the final capital-gains ledger before the analysis can continue."
            }
          }
        }
      })
    ).toEqual({
      ok: false,
      phase: "round_trip_reblocked_new_dependency",
      notes: [
        "Post-unblock rerun returned await_unblock on dependency: other_tax_dependency.",
        "The board action succeeded, but the tax strategy lane truthfully re-entered await_unblock on a different dependency, so the round trip is not verified."
      ]
    });
  });

  it("keeps the broader round trip verified result when the tax lane does not bounce back into await_unblock", () => {
    expect(
      verifyWaitingRoundTrip({
        workflowId: "wf_tax_strategy",
        nativeVerification: { ok: true },
        advancementProof: { phase: "native_blocked_reached" },
        waitingAttentionResolution: { ok: true },
        roundTripProof: {
          ok: true,
          phase: "native_done_reached",
          outcomeEvent: {
            payload: {
              outcomeState: "done",
              postOutcomeActionKind: "none",
              continuitySummary: "The bounded tax strategy review is complete."
            }
          }
        }
      })
    ).toEqual({
      ok: true,
      phase: "round_trip_verified",
      notes: [
        "The first native execution leg reached a truthful attention state.",
        "The live board returned a bounded resolve-attention contract and accepted a native attention resolution.",
        "A fresh native redispatch/advancement was proven after the board action."
      ]
    });
  });

  it("accepts wf_tax_strategy as native-complete when the first live leg finishes directly without surfacing attention", () => {
    expect(
      verifyWaitingRoundTrip({
        workflowId: "wf_tax_strategy",
        nativeVerification: { ok: true },
        advancementProof: {
          phase: "native_done_reached",
          outcomeEvent: {
            payload: {
              outcomeState: "done",
              postOutcomeActionKind: "queue_ceo_review",
              continuitySummary: "The bounded tax strategy review completed directly."
            }
          }
        }
      })
    ).toEqual({
      ok: true,
      phase: "round_trip_not_required",
      notes: [
        "wf_tax_strategy completed directly on the first native execution leg without surfacing a waiting or blocked attention seam.",
        "The bounded attention round-trip proof is skipped because the live lane already reached a truthful done outcome."
      ]
    });
  });
});
