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

export function buildPressureLanes(input) {
  const laneSpecs = Array.isArray(input?.laneSpecs) ? input.laneSpecs : [];
  if (laneSpecs.length > 0) {
    return laneSpecs.map((spec) => parseLaneSpec(spec));
  }

  const args = input?.args ?? {};
  const primaryRuns = parseLaneRuns(args["primary-runs"], 2, "primary-runs");
  const secondaryRuns = parseLaneRuns(args["secondary-runs"], 1, "secondary-runs");
  const tertiaryRuns = parseLaneRuns(args["tertiary-runs"], 0, "tertiary-runs", { allowZero: true });
  const required = [
    "primary-tenant",
    "primary-user",
    "primary-workflow",
    "secondary-tenant",
    "secondary-user",
    "secondary-workflow"
  ];
  const missing = required.filter((key) => !args[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required args: ${missing.map((key) => `--${key}`).join(", ")}`);
  }

  const lanes = [
    {
      lane: "primary",
      tenantId: args["primary-tenant"],
      userId: args["primary-user"],
      workflowId: args["primary-workflow"],
      runs: primaryRuns
    },
    {
      lane: "secondary",
      tenantId: args["secondary-tenant"],
      userId: args["secondary-user"],
      workflowId: args["secondary-workflow"],
      runs: secondaryRuns
    }
  ];

  if (args["tertiary-tenant"] || args["tertiary-user"] || args["tertiary-workflow"] || tertiaryRuns > 0) {
    const tertiaryMissing = ["tertiary-tenant", "tertiary-user", "tertiary-workflow"].filter((key) => !args[key]);
    if (tertiaryMissing.length > 0) {
      throw new Error(`Missing required args: ${tertiaryMissing.map((key) => `--${key}`).join(", ")}`);
    }
    if (tertiaryRuns > 0) {
      lanes.push({
        lane: "tertiary",
        tenantId: args["tertiary-tenant"],
        userId: args["tertiary-user"],
        workflowId: args["tertiary-workflow"],
        runs: tertiaryRuns
      });
    }
  }

  return lanes.map((lane) => normalizeLaneDefinition(lane));
}

export function expandPressureRequests(input) {
  const lanes = Array.isArray(input?.lanes) ? input.lanes.map(normalizeLaneDefinition) : [];
  if (lanes.length === 0) {
    throw new Error("Expanded pressure requests require at least one lane");
  }
  const order = input?.order === "grouped" ? "grouped" : "alternating";
  if (order === "grouped") {
    return lanes.flatMap((lane) =>
      Array.from({ length: lane.runs }, (_value, index) => ({
        lane: lane.lane,
        tenantId: lane.tenantId,
        userId: lane.userId,
        workflowId: lane.workflowId,
        sequence: index + 1
      }))
    );
  }

  const requests = [];
  const maxRuns = Math.max(...lanes.map((lane) => lane.runs));
  for (let index = 0; index < maxRuns; index += 1) {
    for (const lane of lanes) {
      if (index >= lane.runs) {
        continue;
      }
      requests.push({
        lane: lane.lane,
        tenantId: lane.tenantId,
        userId: lane.userId,
        workflowId: lane.workflowId,
        sequence: index + 1
      });
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
  const mode = input?.mode === "drain" ? "drain" : input?.mode === "global-fairness" ? "global-fairness" : "progress";

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

  if ((mode === "drain" || mode === "global-fairness") && incompleteDrains.length > 0) {
    return {
      ok: false,
      phase: mode === "global-fairness" ? "global_fairness_incomplete" : "burst_drain_incomplete",
      totals,
      lanes,
      notes: [
        "Every lane produced progress, but not every requested run reached the burst drain checkpoint.",
        `Still waiting on: ${incompleteDrains.join(", ")}`
      ]
    };
  }

  if (mode === "global-fairness") {
    return summarizeGlobalFairness({
      requests,
      totals,
      lanes,
      workerEvents: Array.isArray(input?.workerEvents) ? input.workerEvents : []
    });
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

function normalizeLaneDefinition(lane) {
  const normalized = {
    ...normalizeLane(lane),
    runs: Number.isInteger(lane?.runs) ? Number(lane.runs) : 0
  };
  if (normalized.runs < 1) {
    throw new Error(`Pressure lane ${normalized.lane} requires runs >= 1`);
  }
  return normalized;
}

function normalizeRequest(request) {
  return {
    lane: String(request?.lane ?? "").trim(),
    tenantId: String(request?.tenantId ?? "").trim(),
    runId: String(request?.runId ?? "").trim(),
    workflowId: String(request?.workflowId ?? "").trim(),
    queuedAt: toTimestamp(request?.queuedAt)
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

function normalizeWorkerEvent(event) {
  return {
    type: String(event?.type ?? "").trim(),
    event: String(event?.event ?? "").trim(),
    workerInstanceId: String(event?.workerInstanceId ?? "").trim(),
    tenantId: String(event?.tenantId ?? "").trim(),
    runId: String(event?.runId ?? "").trim(),
    observedAt: toTimestamp(event?.observedAt) ?? null
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

function summarizeGlobalFairness(input) {
  const requests = Array.isArray(input?.requests) ? input.requests : [];
  const totals = input?.totals ?? {};
  const lanes = input?.lanes ?? {};
  const runToLane = new Map(
    requests.map((request) => [request.runId, request.lane])
  );
  const requestedRunIds = new Set(requests.map((request) => request.runId));
  const allWorkerEvents = (Array.isArray(input?.workerEvents) ? input.workerEvents : [])
    .map((event) => normalizeWorkerEvent(event))
    .filter((event) =>
      (event.type === "wealth_factory_worker_run" || event.type === "wealth_factory_worker_claim")
      && event.workerInstanceId
      && requestedRunIds.has(event.runId)
    );
  const startedEvents = selectFairnessStartEvents(allWorkerEvents)
    .sort((left, right) => {
      const leftMs = left.observedAt ? Date.parse(left.observedAt) : Number.MAX_SAFE_INTEGER;
      const rightMs = right.observedAt ? Date.parse(right.observedAt) : Number.MAX_SAFE_INTEGER;
      if (leftMs !== rightMs) {
        return leftMs - rightMs;
      }
      return left.runId.localeCompare(right.runId);
    });

  const distinctWorkers = [...new Set(startedEvents.map((event) => event.workerInstanceId))];
  const laneCount = Object.keys(lanes).length;
  const startedByRun = new Set(startedEvents.map((event) => event.runId));
  const missingStartedRuns = requests
    .filter((request) => !startedByRun.has(request.runId))
    .map((request) => `${request.lane}:${request.runId}`);

  if (allWorkerEvents.length === 0 || startedEvents.length === 0) {
    return {
      ok: false,
      phase: "missing_worker_telemetry",
      totals,
      lanes,
      workers: {
        distinctWorkers,
        observedEvents: summarizeWorkerEvents(allWorkerEvents, runToLane),
        startedEvents: summarizeWorkerEvents(startedEvents, runToLane)
      },
      notes: [
        "Global fairness could not be assessed because matching worker start telemetry was missing for the requested runs.",
        `Observed workers: ${distinctWorkers.join(", ") || "none"}`
      ]
    };
  }

  if (distinctWorkers.length < 2) {
    return {
      ok: false,
      phase: "single_worker_only",
      totals,
      lanes,
      workers: {
        distinctWorkers,
        observedEvents: summarizeWorkerEvents(allWorkerEvents, runToLane),
        startedEvents: summarizeWorkerEvents(startedEvents, runToLane)
      },
      notes: [
        "Global fairness requires more than one worker to participate in the observed start events.",
        `Observed workers: ${distinctWorkers.join(", ") || "none"}`
      ]
    };
  }

  if (missingStartedRuns.length > 0) {
    return {
      ok: false,
      phase: "worker_event_gaps",
      totals,
      lanes,
      workers: {
        distinctWorkers,
        observedEvents: summarizeWorkerEvents(allWorkerEvents, runToLane),
        startedEvents: summarizeWorkerEvents(startedEvents, runToLane)
      },
      notes: [
        "At least one requested run reached the drain checkpoint without a matching worker start event.",
        `Missing worker events: ${missingStartedRuns.join(", ")}`
      ]
    };
  }

  const coverageWindows = summarizeCoverageWindows(startedEvents, laneCount, distinctWorkers.length, runToLane);
  const failedCoverage = coverageWindows.find((window) => window.uniqueLanesSeen < window.expectedUniqueLanes);
  if (failedCoverage) {
    return {
      ok: false,
      phase: "cross_worker_lane_skew_detected",
      totals,
      lanes,
      workers: {
        distinctWorkers,
        observedEvents: summarizeWorkerEvents(allWorkerEvents, runToLane),
        startedEvents: summarizeWorkerEvents(startedEvents, runToLane),
        coverageWindows
      },
      notes: [
        "Multiple workers participated, but early start order still showed lane skew.",
        `First ${failedCoverage.windowSize} starts covered ${failedCoverage.uniqueLanesSeen}/${failedCoverage.expectedUniqueLanes} expected lanes.`
      ]
    };
  }

  return {
    ok: true,
    phase: "global_multi_worker_fairness_observed",
    totals,
    lanes,
    workers: {
      distinctWorkers,
      observedEvents: summarizeWorkerEvents(allWorkerEvents, runToLane),
      startedEvents: summarizeWorkerEvents(startedEvents, runToLane),
      coverageWindows
    },
    notes: [
      "All requested runs reached the burst drain checkpoint.",
      "More than one worker participated in the observed run starts.",
      "Early worker start coverage reached the expected lane count in each burst window.",
      "Observed start ordering is derived from worker log timestamps, not exact queue claim timestamps."
    ]
  };
}

function summarizeWorkerEvents(events, runToLane = new Map()) {
  const byWorker = {};
  const orderedStarts = events.map((event) => {
    byWorker[event.workerInstanceId] = (byWorker[event.workerInstanceId] ?? 0) + 1;
    return {
      event: event.event,
      workerInstanceId: event.workerInstanceId,
      lane: runToLane.get(event.runId) ?? null,
      tenantId: event.tenantId,
      runId: event.runId,
      observedAt: event.observedAt
    };
  });

  return {
    total: events.length,
    byWorker,
    orderedStarts
  };
}

function selectFairnessStartEvents(events) {
  const startedByRun = new Map(
    events
      .filter((event) => event.type === "wealth_factory_worker_run" && event.event === "started")
      .map((event) => [event.runId, event])
  );
  for (const event of events) {
    if (event.type === "wealth_factory_worker_claim" && event.event === "claimed") {
      startedByRun.set(event.runId, event);
    }
  }

  return [...startedByRun.values()];
}

function summarizeCoverageWindows(startedEvents, laneCount, workerCount, runToLane = new Map()) {
  const windows = [];
  if (laneCount < 1 || workerCount < 1) {
    return windows;
  }

  const maxWave = Math.ceil(laneCount / workerCount);
  for (let wave = 1; wave <= maxWave; wave += 1) {
    const windowSize = Math.min(startedEvents.length, workerCount * wave);
    const workerIds = startedEvents
      .slice(0, windowSize)
      .map((event) => event.workerInstanceId)
      .filter(Boolean);
    const participatingWorkers = new Set(workerIds).size;
    const laneIds = startedEvents
      .slice(0, windowSize)
      .map((event) => runToLane.get(event.runId))
      .filter(Boolean);
    const uniqueLanesSeen = new Set(laneIds).size;
    windows.push({
      wave,
      windowSize,
      participatingWorkers,
      expectedUniqueLanes: Math.min(laneCount, Math.max(1, participatingWorkers) * wave),
      uniqueLanesSeen
    });
  }
  return windows;
}

function parseLaneSpec(spec) {
  const parts = String(spec ?? "").split(":");
  if (parts.length !== 5) {
    throw new Error("Lane specs must be formatted as lane:tenant:user:workflow:runs");
  }
  const [lane, tenantId, userId, workflowId, runs] = parts;
  return normalizeLaneDefinition({
    lane,
    tenantId,
    userId,
    workflowId,
    runs: parseLaneRuns(runs, 0, `${lane}-runs`)
  });
}

function parseLaneRuns(value, fallback, label, options = {}) {
  const allowZero = options.allowZero === true;
  if (value === undefined || value === null || String(value).trim().length === 0) {
    return fallback;
  }
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isInteger(parsed) || parsed < 0 || (!allowZero && parsed < 1)) {
    throw new Error(`Expected --${label} to be a ${allowZero ? "non-negative" : "positive"} integer`);
  }
  return parsed;
}
