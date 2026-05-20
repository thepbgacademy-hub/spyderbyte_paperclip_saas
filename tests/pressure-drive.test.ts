import { createRequire } from "node:module";

import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { buildPressureLanes, createPressureRequests, expandPressureRequests, summarizePressureProof } = require("../scripts/lib/pressure-drive.mjs");

describe("pressure drive helpers", () => {
  it("creates alternating pressure requests across lanes", () => {
    expect(
      createPressureRequests({
        lanes: [
          { lane: "primary", tenantId: "tenant-1", userId: "user-1", workflowId: "workflow-1" },
          { lane: "secondary", tenantId: "tenant-2", userId: "user-2", workflowId: "workflow-2" }
        ],
        runsPerLane: 2,
        order: "alternating"
      }).map((request: { lane: string; tenantId: string }) => ({
        lane: request.lane,
        tenantId: request.tenantId
      }))
    ).toEqual([
      { lane: "primary", tenantId: "tenant-1" },
      { lane: "secondary", tenantId: "tenant-2" },
      { lane: "primary", tenantId: "tenant-1" },
      { lane: "secondary", tenantId: "tenant-2" }
    ]);
  });

  it("builds arbitrary lane definitions from repeated lane specs", () => {
    expect(
      buildPressureLanes({
        laneSpecs: [
          "alpha:tenant-1:user-1:workflow-1:2",
          "beta:tenant-2:user-2:workflow-2:1",
          "gamma:tenant-3:user-3:workflow-3:3"
        ]
      })
    ).toEqual([
      { lane: "alpha", tenantId: "tenant-1", userId: "user-1", workflowId: "workflow-1", runs: 2 },
      { lane: "beta", tenantId: "tenant-2", userId: "user-2", workflowId: "workflow-2", runs: 1 },
      { lane: "gamma", tenantId: "tenant-3", userId: "user-3", workflowId: "workflow-3", runs: 3 }
    ]);
  });

  it("expands generalized lane definitions into alternating run requests", () => {
    expect(
      expandPressureRequests({
        lanes: [
          { lane: "alpha", tenantId: "tenant-1", userId: "user-1", workflowId: "workflow-1", runs: 2 },
          { lane: "beta", tenantId: "tenant-2", userId: "user-2", workflowId: "workflow-2", runs: 1 }
        ]
      })
    ).toEqual([
      { lane: "alpha", tenantId: "tenant-1", userId: "user-1", workflowId: "workflow-1", sequence: 1 },
      { lane: "beta", tenantId: "tenant-2", userId: "user-2", workflowId: "workflow-2", sequence: 1 },
      { lane: "alpha", tenantId: "tenant-1", userId: "user-1", workflowId: "workflow-1", sequence: 2 }
    ]);
  });

  it("summarizes a fair multi-tenant proof when both lanes make progress", () => {
    const summary = summarizePressureProof({
      requests: [
        { lane: "primary", tenantId: "tenant-1", runId: "run-1" },
        { lane: "secondary", tenantId: "tenant-2", runId: "run-2" },
        { lane: "primary", tenantId: "tenant-1", runId: "run-3" },
        { lane: "secondary", tenantId: "tenant-2", runId: "run-4" }
      ],
      snapshots: [
        {
          lane: "primary",
          tenantId: "tenant-1",
          runId: "run-1",
          runStatus: "running",
          outboxStatus: "enqueued",
          queueState: "active",
          observedFirstProgressAt: "2026-05-20T06:00:01.000Z"
        },
        {
          lane: "secondary",
          tenantId: "tenant-2",
          runId: "run-2",
          runStatus: "running",
          outboxStatus: "enqueued",
          queueState: "active",
          observedFirstProgressAt: "2026-05-20T06:00:02.000Z"
        },
        {
          lane: "primary",
          tenantId: "tenant-1",
          runId: "run-3",
          runStatus: "running",
          outboxStatus: "enqueued",
          queueState: "active",
          observedFirstProgressAt: "2026-05-20T06:00:03.000Z"
        },
        {
          lane: "secondary",
          tenantId: "tenant-2",
          runId: "run-4",
          runStatus: "running",
          outboxStatus: "enqueued",
          queueState: "active",
          observedFirstProgressAt: "2026-05-20T06:00:04.000Z"
        }
      ],
      mode: "progress"
    });

    expect(summary.ok).toBe(true);
    expect(summary.phase).toBe("fair_progress_observed");
    expect(summary.totals).toEqual({
      totalRuns: 4,
      byRunStatus: {
        running: 4
      },
      byOutboxStatus: {
        enqueued: 4
      },
      byQueueState: {
        active: 4
      }
    });
    expect(summary.lanes.primary).toMatchObject({
      tenantId: "tenant-1",
      totalRuns: 2,
      firstProgressAt: "2026-05-20T06:00:01.000Z",
      byRunStatus: {
        running: 2
      },
      byOutboxStatus: {
        enqueued: 2
      },
      byQueueState: {
        active: 2
      },
      maxOutboxAttempts: 0,
      runsWithRetries: 0,
      runsWithQueueUnreachable: 0,
      observedWaitToStart: {
        count: 0,
        minMs: null,
        medianMs: null,
        maxMs: null
      }
    });
  });

  it("flags starvation when one lane never produces a progressing run", () => {
    const summary = summarizePressureProof({
      requests: [
        { lane: "primary", tenantId: "tenant-1", runId: "run-1" },
        { lane: "secondary", tenantId: "tenant-2", runId: "run-2" }
      ],
      snapshots: [
        {
          lane: "primary",
          tenantId: "tenant-1",
          runId: "run-1",
          runStatus: "running",
          outboxStatus: "enqueued",
          queueState: "active",
          observedFirstProgressAt: "2026-05-20T06:00:01.000Z"
        },
        {
          lane: "secondary",
          tenantId: "tenant-2",
          runId: "run-2",
          runStatus: "queued",
          outboxStatus: "enqueued",
          queueState: "waiting",
          observedFirstProgressAt: null
        }
      ],
      mode: "progress"
    });

    expect(summary.ok).toBe(false);
    expect(summary.phase).toBe("lane_starvation_detected");
    expect(summary.notes).toContain("At least one requested lane never produced a progressing run.");
  });

  it("does not report success while later runs in a lane are still waiting", () => {
    const summary = summarizePressureProof({
      requests: [
        { lane: "primary", tenantId: "tenant-1", runId: "run-1" },
        { lane: "secondary", tenantId: "tenant-2", runId: "run-2" },
        { lane: "primary", tenantId: "tenant-1", runId: "run-3" }
      ],
      snapshots: [
        {
          lane: "primary",
          tenantId: "tenant-1",
          runId: "run-1",
          runStatus: "running",
          outboxStatus: "enqueued",
          queueState: "active",
          observedFirstProgressAt: "2026-05-20T06:00:01.000Z"
        },
        {
          lane: "secondary",
          tenantId: "tenant-2",
          runId: "run-2",
          runStatus: "running",
          outboxStatus: "enqueued",
          queueState: "active",
          observedFirstProgressAt: "2026-05-20T06:00:02.000Z"
        },
        {
          lane: "primary",
          tenantId: "tenant-1",
          runId: "run-3",
          runStatus: "queued",
          outboxStatus: "enqueued",
          queueState: "waiting",
          observedFirstProgressAt: null
        }
      ],
      mode: "progress"
    });

    expect(summary.ok).toBe(false);
    expect(summary.phase).toBe("incomplete_lane_progress");
    expect(summary.notes).toContain("Every lane produced progress, but not every requested run has progressed yet.");
  });

  it("summarizes burst drain timing and retry pressure once all runs reach the drain checkpoint", () => {
    const summary = summarizePressureProof({
      requests: [
        { lane: "primary", tenantId: "tenant-1", runId: "run-1" },
        { lane: "secondary", tenantId: "tenant-2", runId: "run-2" }
      ],
      snapshots: [
        {
          lane: "primary",
          tenantId: "tenant-1",
          runId: "run-1",
          runStatus: "completed",
          outboxStatus: "enqueued",
          queueState: "completed",
          outboxAttempts: 2,
          queueReachable: true,
          queuedAt: "2026-05-20T06:00:00.000Z",
          observedFirstProgressAt: "2026-05-20T06:00:02.000Z",
          observedFirstStartedAt: "2026-05-20T06:00:02.000Z",
          observedCompletedAt: "2026-05-20T06:00:08.000Z"
        },
        {
          lane: "secondary",
          tenantId: "tenant-2",
          runId: "run-2",
          runStatus: "running",
          outboxStatus: "enqueued",
          queueState: "active",
          outboxAttempts: 1,
          queueReachable: true,
          queuedAt: "2026-05-20T06:00:01.000Z",
          observedFirstProgressAt: "2026-05-20T06:00:03.000Z",
          observedFirstStartedAt: "2026-05-20T06:00:03.000Z",
          observedCompletedAt: null
        }
      ],
      mode: "drain"
    });

    expect(summary.ok).toBe(true);
    expect(summary.phase).toBe("burst_drain_observed");
    expect(summary.lanes.primary).toMatchObject({
      maxOutboxAttempts: 2,
      runsWithRetries: 1,
      observedWaitToStart: {
        count: 1,
        minMs: 2000,
        medianMs: 2000,
        maxMs: 2000
      },
      observedWaitToComplete: {
        count: 1,
        minMs: 8000,
        medianMs: 8000,
        maxMs: 8000
      }
    });
    expect(summary.lanes.secondary.observedWaitToStart).toMatchObject({
      count: 1,
      minMs: 2000,
      medianMs: 2000,
      maxMs: 2000
    });
  });

  it("flags burst drain as incomplete when later runs never reach the stronger checkpoint", () => {
    const summary = summarizePressureProof({
      requests: [
        { lane: "primary", tenantId: "tenant-1", runId: "run-1" },
        { lane: "secondary", tenantId: "tenant-2", runId: "run-2" }
      ],
      snapshots: [
        {
          lane: "primary",
          tenantId: "tenant-1",
          runId: "run-1",
          runStatus: "running",
          outboxStatus: "enqueued",
          queueState: "active",
          outboxAttempts: 1,
          queueReachable: true,
          queuedAt: "2026-05-20T06:00:00.000Z",
          observedFirstProgressAt: "2026-05-20T06:00:02.000Z",
          observedFirstStartedAt: "2026-05-20T06:00:02.000Z",
          observedCompletedAt: null
        },
        {
          lane: "secondary",
          tenantId: "tenant-2",
          runId: "run-2",
          runStatus: "queued",
          outboxStatus: "enqueued",
          queueState: "waiting",
          outboxAttempts: 3,
          queueReachable: false,
          queuedAt: "2026-05-20T06:00:01.000Z",
          observedFirstProgressAt: "2026-05-20T06:00:04.000Z",
          observedFirstStartedAt: null,
          observedCompletedAt: null
        }
      ],
      mode: "drain"
    });

    expect(summary.ok).toBe(false);
    expect(summary.phase).toBe("burst_drain_incomplete");
    expect(summary.notes).toContain("Every lane produced progress, but not every requested run reached the burst drain checkpoint.");
  });

  it("summarizes global multi-worker fairness when early starts cover expected lanes", () => {
    const summary = summarizePressureProof({
      requests: [
        { lane: "alpha", tenantId: "tenant-1", runId: "run-1" },
        { lane: "beta", tenantId: "tenant-2", runId: "run-2" },
        { lane: "gamma", tenantId: "tenant-3", runId: "run-3" }
      ],
      snapshots: [
        {
          lane: "alpha",
          tenantId: "tenant-1",
          runId: "run-1",
          runStatus: "running",
          outboxStatus: "enqueued",
          queueState: "active",
          queuedAt: "2026-05-20T06:00:00.000Z",
          observedFirstProgressAt: "2026-05-20T06:00:02.000Z",
          observedFirstStartedAt: "2026-05-20T06:00:02.000Z"
        },
        {
          lane: "beta",
          tenantId: "tenant-2",
          runId: "run-2",
          runStatus: "running",
          outboxStatus: "enqueued",
          queueState: "active",
          queuedAt: "2026-05-20T06:00:00.000Z",
          observedFirstProgressAt: "2026-05-20T06:00:02.100Z",
          observedFirstStartedAt: "2026-05-20T06:00:02.100Z"
        },
        {
          lane: "gamma",
          tenantId: "tenant-3",
          runId: "run-3",
          runStatus: "running",
          outboxStatus: "enqueued",
          queueState: "active",
          queuedAt: "2026-05-20T06:00:00.000Z",
          observedFirstProgressAt: "2026-05-20T06:00:03.000Z",
          observedFirstStartedAt: "2026-05-20T06:00:03.000Z"
        }
      ],
      workerEvents: [
        {
          type: "wealth_factory_worker_run",
          event: "started",
          workerInstanceId: "worker-a",
          tenantId: "tenant-1",
          runId: "run-1",
          observedAt: "2026-05-20T06:00:02.000Z"
        },
        {
          type: "wealth_factory_worker_run",
          event: "started",
          workerInstanceId: "worker-b",
          tenantId: "tenant-2",
          runId: "run-2",
          observedAt: "2026-05-20T06:00:02.100Z"
        },
        {
          type: "wealth_factory_worker_run",
          event: "started",
          workerInstanceId: "worker-a",
          tenantId: "tenant-3",
          runId: "run-3",
          observedAt: "2026-05-20T06:00:03.000Z"
        }
      ],
      mode: "global-fairness"
    });

    expect(summary.ok).toBe(true);
    expect(summary.phase).toBe("global_multi_worker_fairness_observed");
    expect(summary.workers.distinctWorkers).toEqual(["worker-a", "worker-b"]);
    expect(summary.workers.coverageWindows).toEqual([
      { wave: 1, windowSize: 2, participatingWorkers: 2, expectedUniqueLanes: 2, uniqueLanesSeen: 2 },
      { wave: 2, windowSize: 3, participatingWorkers: 2, expectedUniqueLanes: 3, uniqueLanesSeen: 3 }
    ]);
  });

  it("reports missing worker telemetry instead of single-worker-only when no matching start events exist", () => {
    const summary = summarizePressureProof({
      requests: [
        { lane: "alpha", tenantId: "tenant-1", runId: "run-1" },
        { lane: "beta", tenantId: "tenant-2", runId: "run-2" }
      ],
      snapshots: [
        {
          lane: "alpha",
          tenantId: "tenant-1",
          runId: "run-1",
          runStatus: "running",
          outboxStatus: "enqueued",
          queueState: "completed",
          observedFirstProgressAt: "2026-05-20T06:00:02.000Z",
          observedFirstStartedAt: "2026-05-20T06:00:02.000Z"
        },
        {
          lane: "beta",
          tenantId: "tenant-2",
          runId: "run-2",
          runStatus: "running",
          outboxStatus: "enqueued",
          queueState: "completed",
          observedFirstProgressAt: "2026-05-20T06:00:02.500Z",
          observedFirstStartedAt: "2026-05-20T06:00:02.500Z"
        }
      ],
      workerEvents: [
        {
          type: "wealth_factory_worker_run",
          event: "released",
          workerInstanceId: "worker-a",
          tenantId: "tenant-1",
          runId: "run-1",
          observedAt: "2026-05-20T06:00:02.700Z"
        }
      ],
      mode: "global-fairness"
    });

    expect(summary.ok).toBe(false);
    expect(summary.phase).toBe("missing_worker_telemetry");
  });

  it("flags global fairness skew when one tenant monopolizes early multi-worker starts", () => {
    const summary = summarizePressureProof({
      requests: [
        { lane: "alpha", tenantId: "tenant-1", runId: "run-1" },
        { lane: "alpha", tenantId: "tenant-1", runId: "run-1b" },
        { lane: "beta", tenantId: "tenant-2", runId: "run-2" },
        { lane: "gamma", tenantId: "tenant-3", runId: "run-3" }
      ],
      snapshots: [
        {
          lane: "alpha",
          tenantId: "tenant-1",
          runId: "run-1",
          runStatus: "running",
          outboxStatus: "enqueued",
          queueState: "active",
          observedFirstProgressAt: "2026-05-20T06:00:02.000Z",
          observedFirstStartedAt: "2026-05-20T06:00:02.000Z"
        },
        {
          lane: "alpha",
          tenantId: "tenant-1",
          runId: "run-1b",
          runStatus: "running",
          outboxStatus: "enqueued",
          queueState: "active",
          observedFirstProgressAt: "2026-05-20T06:00:02.050Z",
          observedFirstStartedAt: "2026-05-20T06:00:02.050Z"
        },
        {
          lane: "beta",
          tenantId: "tenant-2",
          runId: "run-2",
          runStatus: "running",
          outboxStatus: "enqueued",
          queueState: "active",
          observedFirstProgressAt: "2026-05-20T06:00:03.000Z",
          observedFirstStartedAt: "2026-05-20T06:00:03.000Z"
        },
        {
          lane: "gamma",
          tenantId: "tenant-3",
          runId: "run-3",
          runStatus: "running",
          outboxStatus: "enqueued",
          queueState: "active",
          observedFirstProgressAt: "2026-05-20T06:00:03.100Z",
          observedFirstStartedAt: "2026-05-20T06:00:03.100Z"
        }
      ],
      workerEvents: [
        {
          type: "wealth_factory_worker_run",
          event: "started",
          workerInstanceId: "worker-a",
          tenantId: "tenant-1",
          runId: "run-1",
          observedAt: "2026-05-20T06:00:02.000Z"
        },
        {
          type: "wealth_factory_worker_run",
          event: "started",
          workerInstanceId: "worker-b",
          tenantId: "tenant-1",
          runId: "run-1b",
          observedAt: "2026-05-20T06:00:02.050Z"
        },
        {
          type: "wealth_factory_worker_run",
          event: "started",
          workerInstanceId: "worker-a",
          tenantId: "tenant-2",
          runId: "run-2",
          observedAt: "2026-05-20T06:00:03.000Z"
        },
        {
          type: "wealth_factory_worker_run",
          event: "started",
          workerInstanceId: "worker-b",
          tenantId: "tenant-3",
          runId: "run-3",
          observedAt: "2026-05-20T06:00:03.100Z"
        }
      ],
      mode: "global-fairness"
    });

    expect(summary.ok).toBe(false);
    expect(summary.phase).toBe("cross_worker_lane_skew_detected");
  });

  it("tracks skew by declared lane instead of collapsing multiple lanes that share a tenant", () => {
    const summary = summarizePressureProof({
      requests: [
        { lane: "alpha", tenantId: "tenant-shared", runId: "run-1" },
        { lane: "beta", tenantId: "tenant-shared", runId: "run-2" },
        { lane: "gamma", tenantId: "tenant-3", runId: "run-3" }
      ],
      snapshots: [
        {
          lane: "alpha",
          tenantId: "tenant-shared",
          runId: "run-1",
          runStatus: "running",
          outboxStatus: "enqueued",
          queueState: "active",
          observedFirstProgressAt: "2026-05-20T06:00:02.000Z",
          observedFirstStartedAt: "2026-05-20T06:00:02.000Z"
        },
        {
          lane: "beta",
          tenantId: "tenant-shared",
          runId: "run-2",
          runStatus: "running",
          outboxStatus: "enqueued",
          queueState: "active",
          observedFirstProgressAt: "2026-05-20T06:00:02.050Z",
          observedFirstStartedAt: "2026-05-20T06:00:02.050Z"
        },
        {
          lane: "gamma",
          tenantId: "tenant-3",
          runId: "run-3",
          runStatus: "running",
          outboxStatus: "enqueued",
          queueState: "active",
          observedFirstProgressAt: "2026-05-20T06:00:03.000Z",
          observedFirstStartedAt: "2026-05-20T06:00:03.000Z"
        }
      ],
      workerEvents: [
        {
          type: "wealth_factory_worker_run",
          event: "started",
          workerInstanceId: "worker-a",
          tenantId: "tenant-shared",
          runId: "run-1",
          observedAt: "2026-05-20T06:00:02.000Z"
        },
        {
          type: "wealth_factory_worker_run",
          event: "started",
          workerInstanceId: "worker-b",
          tenantId: "tenant-shared",
          runId: "run-2",
          observedAt: "2026-05-20T06:00:02.050Z"
        },
        {
          type: "wealth_factory_worker_run",
          event: "started",
          workerInstanceId: "worker-a",
          tenantId: "tenant-3",
          runId: "run-3",
          observedAt: "2026-05-20T06:00:03.000Z"
        }
      ],
      mode: "global-fairness"
    });

    expect(summary.ok).toBe(true);
    expect(summary.phase).toBe("global_multi_worker_fairness_observed");
    expect(summary.workers.coverageWindows[0]).toEqual({
      wave: 1,
      windowSize: 2,
      participatingWorkers: 2,
      expectedUniqueLanes: 2,
      uniqueLanesSeen: 2
    });
    expect(summary.workers.coverageWindows[1]).toEqual({
      wave: 2,
      windowSize: 3,
      participatingWorkers: 2,
      expectedUniqueLanes: 3,
      uniqueLanesSeen: 3
    });
  });

  it("does not overstate early lane expectations before a later worker participates", () => {
    const summary = summarizePressureProof({
      requests: [
        { lane: "alpha", tenantId: "tenant-1", runId: "run-1" },
        { lane: "beta", tenantId: "tenant-2", runId: "run-2" },
        { lane: "gamma", tenantId: "tenant-3", runId: "run-3" }
      ],
      snapshots: [
        {
          lane: "alpha",
          tenantId: "tenant-1",
          runId: "run-1",
          runStatus: "running",
          outboxStatus: "enqueued",
          queueState: "active",
          observedFirstProgressAt: "2026-05-20T06:00:02.000Z",
          observedFirstStartedAt: "2026-05-20T06:00:02.000Z"
        },
        {
          lane: "beta",
          tenantId: "tenant-2",
          runId: "run-2",
          runStatus: "running",
          outboxStatus: "enqueued",
          queueState: "active",
          observedFirstProgressAt: "2026-05-20T06:00:02.050Z",
          observedFirstStartedAt: "2026-05-20T06:00:02.050Z"
        },
        {
          lane: "gamma",
          tenantId: "tenant-3",
          runId: "run-3",
          runStatus: "running",
          outboxStatus: "enqueued",
          queueState: "active",
          observedFirstProgressAt: "2026-05-20T06:00:03.000Z",
          observedFirstStartedAt: "2026-05-20T06:00:03.000Z"
        }
      ],
      workerEvents: [
        {
          type: "wealth_factory_worker_run",
          event: "started",
          workerInstanceId: "worker-a",
          tenantId: "tenant-1",
          runId: "run-1",
          observedAt: "2026-05-20T06:00:02.000Z"
        },
        {
          type: "wealth_factory_worker_run",
          event: "started",
          workerInstanceId: "worker-a",
          tenantId: "tenant-2",
          runId: "run-2",
          observedAt: "2026-05-20T06:00:02.050Z"
        },
        {
          type: "wealth_factory_worker_run",
          event: "started",
          workerInstanceId: "worker-b",
          tenantId: "tenant-3",
          runId: "run-3",
          observedAt: "2026-05-20T06:00:03.000Z"
        }
      ],
      mode: "global-fairness"
    });

    expect(summary.ok).toBe(true);
    expect(summary.phase).toBe("global_multi_worker_fairness_observed");
    expect(summary.workers.coverageWindows[0]).toEqual({
      wave: 1,
      windowSize: 2,
      participatingWorkers: 1,
      expectedUniqueLanes: 1,
      uniqueLanesSeen: 2
    });
    expect(summary.workers.coverageWindows[1]).toEqual({
      wave: 2,
      windowSize: 3,
      participatingWorkers: 2,
      expectedUniqueLanes: 3,
      uniqueLanesSeen: 3
    });
  });
});
