export function parseModeArg(value) {
  const requestedMode = value === undefined ? "progress" : value;
  if (requestedMode === "progress" || requestedMode === "drain") {
    return {
      requestedMode,
      summaryMode: requestedMode,
      analysisPending: false,
      captureNotes: []
    };
  }
  if (requestedMode === "global-fairness") {
    return {
      requestedMode,
      summaryMode: "drain",
      analysisPending: true,
      captureNotes: [
        "prove-live-fairness captures drain-phase proof only.",
        "Use analyze-worker-fairness with captured worker logs to compute the final global fairness verdict."
      ]
    };
  }
  throw new Error("Invalid --mode: expected 'progress', 'drain', or 'global-fairness'");
}

export function shouldInspectQueueState({ runStatus, previousObservation }) {
  return runStatus === "queued" && !previousObservation?.observedFirstProgressAt;
}

export function applyQueuedRunIdentity({ request, queueResult }) {
  if (!queueResult?.ok) {
    return queueResult;
  }

  const queuedRunId = typeof queueResult?.result?.runId === "string"
    ? queueResult.result.runId.trim()
    : "";
  if (!queuedRunId) {
    return queueResult;
  }

  request.runId = queuedRunId;
  request.idempotencyKey = `${request.tenantId}:${request.workflowId}:${queuedRunId}`;
  return queueResult;
}

export function updateSuccessWindow({
  summaryOk,
  nowMs,
  postSuccessObservationMs,
  successObservedAt
}) {
  if (!summaryOk) {
    return {
      successObservedAt: null,
      readyToFinalize: false
    };
  }

  const nextSuccessObservedAt = successObservedAt ?? nowMs;
  if (postSuccessObservationMs <= 0) {
    return {
      successObservedAt: nextSuccessObservedAt,
      readyToFinalize: true
    };
  }

  return {
    successObservedAt: nextSuccessObservedAt,
    readyToFinalize: nowMs - nextSuccessObservedAt >= postSuccessObservationMs
  };
}

export function buildProofOutput({
  modeConfig,
  summary,
  requests,
  snapshots,
  queueSnapshots,
  observationDurationMs,
  postSuccessObservationMs,
  additionalNotes = []
}) {
  const base = {
    requestedMode: modeConfig.requestedMode,
    summaryMode: modeConfig.summaryMode,
    requests,
    snapshots,
    queueSnapshots,
    summary,
    notes: [...modeConfig.captureNotes, ...additionalNotes],
    observationDurationMs,
    postSuccessObservationMs
  };

  if (modeConfig.analysisPending && summary.ok) {
    return {
      ok: false,
      phase: "global_fairness_analysis_required",
      analysisPending: true,
      captureOk: true,
      ...base
    };
  }

  return {
    ok: summary.ok,
    phase: summary.phase,
    analysisPending: false,
    captureOk: summary.ok,
    ...base
  };
}
