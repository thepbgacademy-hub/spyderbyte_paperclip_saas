export function verifyWaitingRoundTrip({
  workflowId,
  nativeVerification,
  advancementProof,
  waitingAttentionResolution,
  roundTripProof
}) {
  if (!shouldProveAttentionRoundTripForWorkflow(workflowId)) {
    return {
      ok: true,
      phase: "round_trip_not_required",
      notes: [
        `Attention round-trip proof is not required for ${workflowId}, so it keeps the existing native advancement acceptance only.`
      ]
    };
  }

  if (!nativeVerification?.ok) {
    return {
      ok: false,
      phase: "native_execution_not_verified",
      notes: [
        "The bounded waiting-lane round-trip proof cannot continue until the first native advancement leg is verified."
      ]
    };
  }

  if (advancementProof?.phase === "native_done_reached") {
    return {
      ok: true,
      phase: "round_trip_not_required",
      notes: [
        `${workflowId} completed directly on the first native execution leg without surfacing a waiting or blocked attention seam.`,
        "The bounded attention round-trip proof is skipped because the live lane already reached a truthful done outcome."
      ]
    };
  }

  if (advancementProof?.phase !== "native_waiting_reached" && advancementProof?.phase !== "native_blocked_reached") {
    return {
      ok: false,
      phase: "native_attention_not_reached",
      notes: [
        "The first native advancement leg did not land in a waiting or blocked attention state, so the bounded resolve-attention round-trip cannot be proven honestly."
      ]
    };
  }

  if (!waitingAttentionResolution?.ok) {
    return {
      ok: false,
      phase: waitingAttentionResolution?.phase ?? "waiting_attention_not_resolved",
      notes: waitingAttentionResolution?.notes ?? [
        "The live board did not return a resolvable native attention contract."
      ]
    };
  }

  if (!roundTripProof?.ok) {
    return {
      ok: false,
      phase: roundTripProof?.phase ?? "waiting_lane_redispatch_not_verified",
      notes: roundTripProof?.notes ?? [
        "The native board action succeeded, but durable native redispatch after that action was not proven."
      ]
    };
  }

  const reboundFailure = detectImmediateAwaitUnblockReentry({
    workflowId,
    advancementProof,
    roundTripProof
  });
  if (reboundFailure) {
    return reboundFailure;
  }

  return {
    ok: true,
    phase: "round_trip_verified",
    notes: [
      "The first native execution leg reached a truthful attention state.",
      "The live board returned a bounded resolve-attention contract and accepted a native attention resolution.",
      "A fresh native redispatch/advancement was proven after the board action."
    ]
  };
}

function shouldProveAttentionRoundTripForWorkflow(workflowId) {
  return workflowId === "wf_connect_first_workflow" || workflowId === "wf_tax_strategy";
}

function detectImmediateAwaitUnblockReentry({ workflowId, advancementProof, roundTripProof }) {
  if (workflowId !== "wf_tax_strategy") {
    return null;
  }

  const outcomeState = normalizeValue(roundTripProof?.outcomeEvent?.payload?.outcomeState);
  const postOutcomeActionKind = normalizeValue(roundTripProof?.outcomeEvent?.payload?.postOutcomeActionKind);

  if (outcomeState !== "blocked" || postOutcomeActionKind !== "await_unblock") {
    return null;
  }

  const previousDependencyLabel = deriveTaxDependencyLabel(advancementProof?.outcomeEvent?.payload?.continuitySummary);
  const dependencyLabel = deriveTaxDependencyLabel(roundTripProof?.outcomeEvent?.payload?.continuitySummary);
  const sameDependency = previousDependencyLabel !== "unknown_dependency" && previousDependencyLabel === dependencyLabel;

  return {
    ok: false,
    phase: sameDependency ? "round_trip_reblocked_same_dependency" : "round_trip_reblocked_new_dependency",
    notes: [
      `Post-unblock rerun returned await_unblock on dependency: ${dependencyLabel}.`,
      sameDependency
        ? "The board action succeeded, but the tax strategy lane truthfully re-entered the same unblock path, so the round trip is not verified."
        : "The board action succeeded, but the tax strategy lane truthfully re-entered await_unblock on a different dependency, so the round trip is not verified."
    ]
  };
}

function deriveTaxDependencyLabel(continuitySummary) {
  const lowerSummary = normalizeValue(continuitySummary)?.toLowerCase();
  if (!lowerSummary) {
    return "unknown_dependency";
  }
  if (lowerSummary.includes("founder tax posture")) {
    return "founder_tax_posture_documents";
  }
  return "other_tax_dependency";
}

function normalizeValue(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}
