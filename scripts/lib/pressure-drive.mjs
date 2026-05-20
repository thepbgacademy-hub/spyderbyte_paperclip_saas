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
    byRunStatus: {}
  };

  for (const request of requests) {
    const snapshot = snapshots.get(request.runId) ?? normalizeSnapshot(request);
    const laneSummary = lanes[request.lane] ?? {
      tenantId: request.tenantId,
      totalRuns: 0,
      byRunStatus: {},
      firstProgressAt: null
    };
    laneSummary.totalRuns += 1;
    laneSummary.byRunStatus[snapshot.runStatus] = (laneSummary.byRunStatus[snapshot.runStatus] ?? 0) + 1;
    if (snapshot.firstProgressAt && (!laneSummary.firstProgressAt || snapshot.firstProgressAt < laneSummary.firstProgressAt)) {
      laneSummary.firstProgressAt = snapshot.firstProgressAt;
    }
    lanes[request.lane] = laneSummary;
    totals.byRunStatus[snapshot.runStatus] = (totals.byRunStatus[snapshot.runStatus] ?? 0) + 1;
  }

  const laneWithoutProgress = Object.entries(lanes)
    .filter(([, lane]) => !lane.firstProgressAt)
    .map(([lane]) => lane);
  const stalledRuns = requests
    .filter((request) => !(snapshots.get(request.runId)?.firstProgressAt))
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

  if (stalledRuns.length > 0) {
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
    phase: "fair_progress_observed",
    totals,
    lanes,
    notes: [
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
    firstProgressAt: typeof snapshot?.firstProgressAt === "string" && snapshot.firstProgressAt.trim().length > 0
      ? snapshot.firstProgressAt
      : null
  };
}
