export function createPressureRequests(input) {
  const lanes = Array.isArray(input?.lanes) ? input.lanes : [];
  const runsPerLane = Number.isInteger(input?.runsPerLane) ? input.runsPerLane : 0;
  const order = input?.order === "grouped" ? "grouped" : "alternating";

  if (lanes.length === 0) {
    throw new Error("Pressure requests require at least one lane");
  }
  if (runsPerLane < 1) {
    throw new Error("Pressure requests require runsPerLane >= 1");
  }

  const normalizedLanes = lanes.map((lane) => normalizeLane(lane));
  const requests = [];

  if (order === "grouped") {
    for (const lane of normalizedLanes) {
      for (let index = 0; index < runsPerLane; index += 1) {
        requests.push(createLaneRequest(lane, index));
      }
    }
    return requests;
  }

  for (let index = 0; index < runsPerLane; index += 1) {
    for (const lane of normalizedLanes) {
      requests.push(createLaneRequest(lane, index));
    }
  }

  return requests;
}

export function summarizePressureProof(input) {
  const requests = Array.isArray(input?.requests) ? input.requests.map(normalizeRequest) : [];
  const snapshots = new Map(
    (Array.isArray(input?.snapshots) ? input.snapshots : []).map((snapshot) => {
      const normalized = normalizeSnapshot(snapshot);
      return [normalized.runId, normalized];
    })
  );

  const lanes = {};
  const totals = {
    totalRuns: requests.length,
    byRunStatus: {},
    byOutboxStatus: {},
    byQueueState: {}
  };
  const mode = input?.mode === "drain" ? "drain" : "progress";

  for (const request of requests) {
    const snapshot = snapshots.get(request.runId) ?? normalizeSnapshot(request);
    const laneSummary = lanes[request.lane] ?? {
      tenantId: request.tenantId,
      totalRuns: 0,
      byRunStatus: {},
      byOutboxStatus: {},
      byQueueState: {},
      firstQueuedAt: null,
      firstProgressAt: null,
      firstStartedAt: null,
      completedAt: null,
      maxOutboxAttempts: 0,
      runsWithRetries: 0,
      runsWithQueueUnreachable: 0,
      observedWaitToStartMs: [],
      observedWaitToCompleteMs: []
    };
    laneSummary.totalRuns += 1;
    laneSummary.byRunStatus[snapshot.runStatus] = (laneSummary.byRunStatus[snapshot.runStatus] ?? 0) + 1;
    if (snapshot.outboxStatus) {
      laneSummary.byOutboxStatus[snapshot.outboxStatus] = (laneSummary.byOutboxStatus[snapshot.outboxStatus] ?? 0) + 1;
      totals.byOutboxStatus[snapshot.outboxStatus] = (totals.byOutboxStatus[snapshot.outboxStatus] ?? 0) + 1;
    }
    if (snapshot.queueState) {
      laneSummary.byQueueState[snapshot.queueState] = (laneSummary.byQueueState[snapshot.queueState] ?? 0) + 1;
      totals.byQueueState[snapshot.queueState] = (totals.byQueueState[snapshot.queueState] ?? 0) + 1;
    }
    if (snapshot.queuedAt && (!laneSummary.firstQueuedAt || snapshot.queuedAt < laneSummary.firstQueuedAt)) {
      laneSummary.firstQueuedAt = snapshot.queuedAt;
    }
    if (snapshot.observedFirstProgressAt && (!laneSummary.firstProgressAt || snapshot.observedFirstProgressAt < laneSummary.firstProgressAt)) {
      laneSummary.firstProgressAt = snapshot.observedFirstProgressAt;
    }
    if (snapshot.observedFirstStartedAt && (!laneSummary.firstStartedAt || snapshot.observedFirstStartedAt < laneSummary.firstStartedAt)) {
      laneSummary.firstStartedAt = snapshot.observedFirstStartedAt;
    }
    if (snapshot.observedCompletedAt && (!laneSummary.completedAt || snapshot.observedCompletedAt > laneSummary.completedAt)) {
      laneSummary.completedAt = snapshot.observedCompletedAt;
    }
    laneSummary.maxOutboxAttempts = Math.max(laneSummary.maxOutboxAttempts, snapshot.outboxAttempts);
    if (snapshot.outboxAttempts > 1) {
      laneSummary.runsWithRetries += 1;
    }
    if (snapshot.queueReachable === false) {
      laneSummary.runsWithQueueUnreachable += 1;
    }
    const waitToStartMs = durationMs(snapshot.queuedAt, snapshot.observedFirstStartedAt ?? snapshot.observedFirstProgressAt);
    if (waitToStartMs !== null) {
      laneSummary.observedWaitToStartMs.push(waitToStartMs);
    }
    const waitToCompleteMs = durationMs(snapshot.queuedAt, snapshot.observedCompletedAt);
    if (waitToCompleteMs !== null) {
      laneSummary.observedWaitToCompleteMs.push(waitToCompleteMs);
    }
    lanes[request.lane] = laneSummary;
    totals.byRunStatus[snapshot.runStatus] = (totals.byRunStatus[snapshot.runStatus] ?? 0) + 1;
  }

  for (const lane of Object.values(lanes)) {
    lane.observedWaitToStart = summarizeDurations(lane.observedWaitToStartMs);
    lane.observedWaitToComplete = summarizeDurations(lane.observedWaitToCompleteMs);
    delete lane.observedWaitToStartMs;
    delete lane.observedWaitToCompleteMs;
  }

  const laneWithoutProgress = Object.entries(lanes)
    .filter(([, lane]) => !lane.firstProgressAt)
    .map(([lane]) => lane);
  const stalledRuns = requests
    .filter((request) => !(snapshots.get(request.runId)?.observedFirstProgressAt))
    .map((request) => `${request.lane}:${request.runId}`);
  const incompleteDrains = requests
    .filter((request) => !reachedDrainCheckpoint(snapshots.get(request.runId)))
    .map((request) => `${request.lane}:${request.runId}`);

  if (laneWithoutProgress.length > 0) {
    return {
      ok: false,
      phase: "lane_starvation_detected",
      totals,
      lanes,
      notes: [
        "At least one requested lane never produced a progressing run.",
        `Starved lanes: ${laneWithoutProgress.join(", ")}`
      ]
    };
  }

  if (mode === "drain" && incompleteDrains.length > 0) {
    return {
      ok: false,
      phase: "burst_drain_incomplete",
      totals,
      lanes,
      notes: [
        "Every lane produced progress, but not every requested run reached the burst drain checkpoint.",
        `Still waiting on: ${incompleteDrains.join(", ")}`
      ]
    };
  }

  if (mode === "progress" && stalledRuns.length > 0) {
    return {
      ok: false,
      phase: "incomplete_lane_progress",
      totals,
      lanes,
      notes: [
        "Every lane produced progress, but not every requested run has progressed yet.",
        `Still waiting on: ${stalledRuns.join(", ")}`
      ]
    };
  }

  return {
    ok: true,
    phase: mode === "drain" ? "burst_drain_observed" : "fair_progress_observed",
    totals,
    lanes,
    notes: mode === "drain"
      ? [
          "Every requested lane produced at least one progressing run.",
          "Every requested run reached the burst drain checkpoint.",
          "Observed wait metrics are derived from polling timestamps, not exact server-side transition timestamps.",
          "No lane is completely starved at the current observation point."
        ]
      : [
          "Every requested lane produced at least one progressing run.",
          "Every requested run has produced observable progress.",
          "No lane is completely starved at the current observation point."
        ]
  };
}

function createLaneRequest(lane, index) {
  return {
    lane: lane.lane,
    tenantId: lane.tenantId,
    userId: lane.userId,
    workflowId: lane.workflowId,
    sequence: index + 1
  };
}

function normalizeLane(lane) {
  const normalized = {
    lane: String(lane?.lane ?? "").trim(),
    tenantId: String(lane?.tenantId ?? "").trim(),
    userId: String(lane?.userId ?? "").trim(),
    workflowId: String(lane?.workflowId ?? "").trim()
  };
  if (!normalized.lane || !normalized.tenantId || !normalized.userId || !normalized.workflowId) {
    throw new Error("Pressure lanes require lane, tenantId, userId, and workflowId");
  }
  return normalized;
}

function normalizeRequest(request) {
  return {
    lane: String(request?.lane ?? "").trim(),
    tenantId: String(request?.tenantId ?? "").trim(),
    runId: String(request?.runId ?? "").trim()
  };
}

function normalizeSnapshot(snapshot) {
  return {
    lane: String(snapshot?.lane ?? "").trim(),
    tenantId: String(snapshot?.tenantId ?? "").trim(),
    runId: String(snapshot?.runId ?? "").trim(),
    runStatus: String(snapshot?.runStatus ?? "unknown").trim() || "unknown",
    outboxStatus: snapshot?.outboxStatus ? String(snapshot.outboxStatus) : null,
    queueState: snapshot?.queueState ? String(snapshot.queueState) : null,
    outboxAttempts: Number.isFinite(snapshot?.outboxAttempts) ? Number(snapshot.outboxAttempts) : 0,
    queueReachable: typeof snapshot?.queueReachable === "boolean" ? snapshot.queueReachable : null,
    queuedAt: toTimestamp(snapshot?.queuedAt),
    observedFirstProgressAt: typeof snapshot?.observedFirstProgressAt === "string" && snapshot.observedFirstProgressAt.trim().length > 0
      ? snapshot.observedFirstProgressAt
      : null,
    observedFirstStartedAt: toTimestamp(snapshot?.observedFirstStartedAt),
    observedCompletedAt: toTimestamp(snapshot?.observedCompletedAt)
  };
}

function toTimestamp(value) {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function durationMs(start, end) {
  if (!start || !end) {
    return null;
  }
  const startMs = Date.parse(start);
  const endMs = Date.parse(end);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) {
    return null;
  }
  return endMs - startMs;
}

function summarizeDurations(values) {
  if (!Array.isArray(values) || values.length === 0) {
    return {
      count: 0,
      minMs: null,
      medianMs: null,
      maxMs: null
    };
  }

  const sorted = [...values].sort((left, right) => left - right);
  const mid = Math.floor(sorted.length / 2);
  const medianMs = sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
    : sorted[mid];

  return {
    count: sorted.length,
    minMs: sorted[0] ?? null,
    medianMs,
    maxMs: sorted.at(-1) ?? null
  };
}

function reachedDrainCheckpoint(snapshot) {
  if (!snapshot) {
    return false;
  }

  const runStatusReached = snapshot.runStatus === "running" || snapshot.runStatus === "completed";
  const outboxReached = snapshot.outboxStatus === "enqueued";
  const queueReached = snapshot.queueState === "active" || snapshot.queueState === "completed" || snapshot.queueReachable === false;

  return runStatusReached && outboxReached && queueReached;
}
