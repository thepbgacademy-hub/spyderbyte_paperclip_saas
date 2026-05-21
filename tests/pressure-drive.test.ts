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

  it("expands repeated cycles into paced alternating requests", () => {
    expect(
      expandPressureRequests({
        lanes: [
          { lane: "alpha", tenantId: "tenant-1", userId: "user-1", workflowId: "workflow-1", runs: 1 },
          { lane: "beta", tenantId: "tenant-2", userId: "user-2", workflowId: "workflow-2", runs: 1 }
        ],
        cycles: 2
      })
    ).toEqual([
      { lane: "alpha", tenantId: "tenant-1", userId: "user-1", workflowId: "workflow-1", sequence: 1, cycle: 1 },
      { lane: "beta", tenantId: "tenant-2", userId: "user-2", workflowId: "workflow-2", sequence: 1, cycle: 1 },
      { lane: "alpha", tenantId: "tenant-1", userId: "user-1", workflowId: "workflow-1", sequence: 1, cycle: 2 },
      { lane: "beta", tenantId: "tenant-2", userId: "user-2", workflowId: "workflow-2", sequence: 1, cycle: 2 }
    ]);
  });

  it("expands skewed lanes in staggered order so heavier lanes are interleaved first", () => {
    expect(
      expandPressureRequests({
        lanes: [
          { lane: "alpha", tenantId: "tenant-1", userId: "user-1", workflowId: "workflow-1", runs: 3 },
          { lane: "beta", tenantId: "tenant-2", userId: "user-2", workflowId: "workflow-2", runs: 1 },
          { lane: "gamma", tenantId: "tenant-3", userId: "user-3", workflowId: "workflow-3", runs: 2 }
        ],
        order: "staggered"
      }).map((request: { lane: string; sequence: number }) => ({
        lane: request.lane,
        sequence: request.sequence
      }))
    ).toEqual([
      { lane: "alpha", sequence: 1 },
      { lane: "gamma", sequence: 1 },
      { lane: "alpha", sequence: 2 },
      { lane: "beta", sequence: 1 },
      { lane: "gamma", sequence: 2 },
      { lane: "alpha", sequence: 3 }
    ]);
  });

  it("makes staggered order meaningfully different from alternating on a six-lane skewed burst", () => {
    const lanes = [
      { lane: "primary", tenantId: "tenant-1", userId: "user-1", workflowId: "workflow-1", runs: 3 },
      { lane: "secondary", tenantId: "tenant-2", userId: "user-2", workflowId: "workflow-2", runs: 2 },
      { lane: "tertiary", tenantId: "tenant-3", userId: "user-3", workflowId: "workflow-3", runs: 2 },
      { lane: "quaternary", tenantId: "tenant-4", userId: "user-4", workflowId: "workflow-4", runs: 1 },
      { lane: "quinary", tenantId: "tenant-5", userId: "user-5", workflowId: "workflow-5", runs: 1 },
      { lane: "senary", tenantId: "tenant-6", userId: "user-6", workflowId: "workflow-6", runs: 1 }
    ];

    const alternating = expandPressureRequests({ lanes }).map((request: { lane: string }) => request.lane);
    const staggered = expandPressureRequests({ lanes, order: "staggered" }).map((request: { lane: string }) => request.lane);

    expect(staggered).not.toEqual(alternating);
    expect(staggered).toEqual([
      "primary",
      "secondary",
      "tertiary",
      "primary",
      "quaternary",
      "quinary",
      "senary",
      "secondary",
      "tertiary",
      "primary"
    ]);
  });

  it("expands six arbitrary lanes across repeated soak cycles without collapsing them back to legacy named lanes", () => {
    expect(
      expandPressureRequests({
        lanes: [
          { lane: "alpha", tenantId: "tenant-1", userId: "user-1", workflowId: "workflow-1", runs: 1 },
          { lane: "beta", tenantId: "tenant-2", userId: "user-2", workflowId: "workflow-2", runs: 1 },
          { lane: "gamma", tenantId: "tenant-3", userId: "user-3", workflowId: "workflow-3", runs: 1 },
          { lane: "delta", tenantId: "tenant-4", userId: "user-4", workflowId: "workflow-4", runs: 1 },
          { lane: "epsilon", tenantId: "tenant-5", userId: "user-5", workflowId: "workflow-5", runs: 1 },
          { lane: "zeta", tenantId: "tenant-6", userId: "user-6", workflowId: "workflow-6", runs: 1 }
        ],
        cycles: 2
      }).map((request: { lane: string; cycle: number; tenantId: string }) => ({
        lane: request.lane,
        cycle: request.cycle,
        tenantId: request.tenantId
      }))
    ).toEqual([
      { lane: "alpha", cycle: 1, tenantId: "tenant-1" },
      { lane: "beta", cycle: 1, tenantId: "tenant-2" },
      { lane: "gamma", cycle: 1, tenantId: "tenant-3" },
      { lane: "delta", cycle: 1, tenantId: "tenant-4" },
      { lane: "epsilon", cycle: 1, tenantId: "tenant-5" },
      { lane: "zeta", cycle: 1, tenantId: "tenant-6" },
      { lane: "alpha", cycle: 2, tenantId: "tenant-1" },
      { lane: "beta", cycle: 2, tenantId: "tenant-2" },
      { lane: "gamma", cycle: 2, tenantId: "tenant-3" },
      { lane: "delta", cycle: 2, tenantId: "tenant-4" },
      { lane: "epsilon", cycle: 2, tenantId: "tenant-5" },
      { lane: "zeta", cycle: 2, tenantId: "tenant-6" }
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
    expect(summary.saturation).toEqual({
      queue: {
        samples: 0,
        reachableSamples: 0,
        unreachableSamples: 0,
        highWaterMarks: {
          waiting: 0,
          active: 0,
          completed: 0,
          failed: 0,
          delayed: 0,
          paused: 0,
          prioritized: 0,
          waitingChildren: 0
        }
      },
      worker: {
        samples: 0,
        maxActiveRuns: 0,
        maxQueuedRuns: 0,
        maxQueuedTenants: 0,
        maxActiveTenants: 0
      }
    });
  });

  it("summarizes queue and worker saturation alongside a successful proof", () => {
    const summary = summarizePressureProof({
      requests: [
        { lane: "alpha", tenantId: "tenant-1", runId: "run-1" }
      ],
      snapshots: [
        {
          lane: "alpha",
          tenantId: "tenant-1",
          runId: "run-1",
          runStatus: "running",
          outboxStatus: "enqueued",
          queueState: "completed",
          queuedAt: "2026-05-20T06:00:00.000Z",
          observedFirstProgressAt: "2026-05-20T06:00:01.000Z",
          observedFirstStartedAt: "2026-05-20T06:00:01.000Z"
        }
      ],
      queueSnapshots: [
        {
          queueName: "wfpc-workflow-runs",
          observedAt: "2026-05-20T06:00:00.500Z",
          reachable: true,
          counts: {
            waiting: 4,
            active: 2,
            completed: 0,
            failed: 0,
            delayed: 1,
            paused: 0,
            prioritized: 0,
            waitingChildren: 0
          }
        },
        {
          queueName: "wfpc-workflow-runs",
          observedAt: "2026-05-20T06:00:01.500Z",
          reachable: false,
          counts: null
        }
      ],
      fairnessSnapshots: [
        {
          workerInstanceId: "worker-a",
          observedAt: "2026-05-20T06:00:00.750Z",
          activeRuns: 2,
          activeByTenant: {
            "tenant-1": 1,
            "tenant-2": 1
          },
          queuedByTenant: {
            "tenant-1": 2,
            "tenant-2": 1
          }
        }
      ],
      mode: "drain"
    });

    expect(summary.ok).toBe(true);
    expect(summary.saturation).toEqual({
      queue: {
        samples: 2,
        reachableSamples: 1,
        unreachableSamples: 1,
        highWaterMarks: {
          waiting: 4,
          active: 2,
          completed: 0,
          failed: 0,
          delayed: 1,
          paused: 0,
          prioritized: 0,
          waitingChildren: 0
        }
      },
      worker: {
        samples: 1,
        maxActiveRuns: 2,
        maxQueuedRuns: 3,
        maxQueuedTenants: 2,
        maxActiveTenants: 2
      }
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

  it("summarizes a six-lane burst without collapsing distinct lanes into the same fairness bucket", () => {
    const requests = ["alpha", "beta", "gamma", "delta", "epsilon", "zeta"].map((lane, index) => ({
      lane,
      tenantId: `tenant-${index + 1}`,
      runId: `run-${index + 1}`
    }));
    const snapshots = ["alpha", "beta", "gamma", "delta", "epsilon", "zeta"].map((lane, index) => ({
      lane,
      tenantId: `tenant-${index + 1}`,
      runId: `run-${index + 1}`,
      runStatus: "running",
      outboxStatus: "enqueued",
      queueState: "completed",
      outboxAttempts: 1,
      queueReachable: true,
      queuedAt: `2026-05-20T06:00:0${index}.000Z`,
      observedFirstProgressAt: `2026-05-20T06:00:1${index}.000Z`,
      observedFirstStartedAt: `2026-05-20T06:00:2${index}.000Z`,
      observedCompletedAt: null
    }));

    const summary = summarizePressureProof({
      requests,
      snapshots,
      mode: "drain"
    });

    expect(summary.ok).toBe(true);
    expect(summary.phase).toBe("burst_drain_observed");
    expect(Object.keys(summary.lanes)).toEqual(["alpha", "beta", "gamma", "delta", "epsilon", "zeta"]);
    expect(summary.totals.totalRuns).toBe(6);
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

  it("uses BullMQ claim telemetry as the fairness start source when runtime start logs are absent", () => {
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
          observedFirstProgressAt: "2026-05-20T06:00:02.100Z",
          observedFirstStartedAt: "2026-05-20T06:00:02.100Z"
        }
      ],
      workerEvents: [
        {
          type: "wealth_factory_worker_claim",
          event: "claimed",
          workerInstanceId: "worker-a",
          tenantId: "tenant-1",
          runId: "run-1",
          observedAt: "2026-05-20T06:00:01.900Z"
        },
        {
          type: "wealth_factory_worker_claim",
          event: "claimed",
          workerInstanceId: "worker-b",
          tenantId: "tenant-2",
          runId: "run-2",
          observedAt: "2026-05-20T06:00:01.950Z"
        }
      ],
      mode: "global-fairness"
    });

    expect(summary.ok).toBe(true);
    expect(summary.phase).toBe("global_multi_worker_fairness_observed");
    expect(summary.workers.startedEvents.orderedStarts).toEqual([
      expect.objectContaining({ event: "claimed", workerInstanceId: "worker-a", lane: "alpha" }),
      expect.objectContaining({ event: "claimed", workerInstanceId: "worker-b", lane: "beta" })
    ]);
  });

  it("preserves runtime start telemetry for runs that have no claim event in a mixed capture", () => {
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
          observedFirstProgressAt: "2026-05-20T06:00:02.100Z",
          observedFirstStartedAt: "2026-05-20T06:00:02.100Z"
        }
      ],
      workerEvents: [
        {
          type: "wealth_factory_worker_claim",
          event: "claimed",
          workerInstanceId: "worker-a",
          tenantId: "tenant-1",
          runId: "run-1",
          observedAt: "2026-05-20T06:00:01.900Z"
        },
        {
          type: "wealth_factory_worker_run",
          event: "started",
          workerInstanceId: "worker-b",
          tenantId: "tenant-2",
          runId: "run-2",
          observedAt: "2026-05-20T06:00:02.050Z"
        }
      ],
      mode: "global-fairness"
    });

    expect(summary.ok).toBe(true);
    expect(summary.phase).toBe("global_multi_worker_fairness_observed");
    expect(summary.workers.startedEvents.orderedStarts).toEqual([
      expect.objectContaining({ event: "claimed", workerInstanceId: "worker-a", lane: "alpha" }),
      expect.objectContaining({ event: "started", workerInstanceId: "worker-b", lane: "beta" })
    ]);
  });

  it("flags global fairness skew when one tenant monopolizes early multi-worker starts", () => {
    const summary = summarizePressureProof({
      requests: [
        { lane: "alpha", tenantId: "tenant-1", runId: "run-1" },
        { lane: "beta", tenantId: "tenant-2", runId: "run-2" },
        { lane: "alpha", tenantId: "tenant-1", runId: "run-1b" },
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

  it("summarizes repeated cycles as a global soak proof when each cycle preserves cross-worker coverage", () => {
    const summary = summarizePressureProof({
      requests: [
        { lane: "alpha", tenantId: "tenant-1", runId: "run-1", cycle: 1 },
        { lane: "beta", tenantId: "tenant-2", runId: "run-2", cycle: 1 },
        { lane: "gamma", tenantId: "tenant-3", runId: "run-3", cycle: 1 },
        { lane: "alpha", tenantId: "tenant-1", runId: "run-4", cycle: 2 },
        { lane: "beta", tenantId: "tenant-2", runId: "run-5", cycle: 2 },
        { lane: "gamma", tenantId: "tenant-3", runId: "run-6", cycle: 2 }
      ],
      snapshots: [
        { lane: "alpha", tenantId: "tenant-1", runId: "run-1", runStatus: "running", outboxStatus: "enqueued", queueState: "completed", observedFirstProgressAt: "2026-05-20T06:00:02.000Z", observedFirstStartedAt: "2026-05-20T06:00:02.000Z" },
        { lane: "beta", tenantId: "tenant-2", runId: "run-2", runStatus: "running", outboxStatus: "enqueued", queueState: "completed", observedFirstProgressAt: "2026-05-20T06:00:02.100Z", observedFirstStartedAt: "2026-05-20T06:00:02.100Z" },
        { lane: "gamma", tenantId: "tenant-3", runId: "run-3", runStatus: "running", outboxStatus: "enqueued", queueState: "completed", observedFirstProgressAt: "2026-05-20T06:00:03.000Z", observedFirstStartedAt: "2026-05-20T06:00:03.000Z" },
        { lane: "alpha", tenantId: "tenant-1", runId: "run-4", runStatus: "running", outboxStatus: "enqueued", queueState: "completed", observedFirstProgressAt: "2026-05-20T06:00:07.000Z", observedFirstStartedAt: "2026-05-20T06:00:07.000Z" },
        { lane: "beta", tenantId: "tenant-2", runId: "run-5", runStatus: "running", outboxStatus: "enqueued", queueState: "completed", observedFirstProgressAt: "2026-05-20T06:00:07.100Z", observedFirstStartedAt: "2026-05-20T06:00:07.100Z" },
        { lane: "gamma", tenantId: "tenant-3", runId: "run-6", runStatus: "running", outboxStatus: "enqueued", queueState: "completed", observedFirstProgressAt: "2026-05-20T06:00:08.000Z", observedFirstStartedAt: "2026-05-20T06:00:08.000Z" }
      ],
      workerEvents: [
        { type: "wealth_factory_worker_claim", event: "claimed", workerInstanceId: "worker-a", tenantId: "tenant-1", runId: "run-1", observedAt: "2026-05-20T06:00:01.900Z" },
        { type: "wealth_factory_worker_claim", event: "claimed", workerInstanceId: "worker-b", tenantId: "tenant-2", runId: "run-2", observedAt: "2026-05-20T06:00:01.950Z" },
        { type: "wealth_factory_worker_run", event: "started", workerInstanceId: "worker-a", tenantId: "tenant-3", runId: "run-3", observedAt: "2026-05-20T06:00:03.000Z" },
        { type: "wealth_factory_worker_claim", event: "claimed", workerInstanceId: "worker-b", tenantId: "tenant-1", runId: "run-4", observedAt: "2026-05-20T06:00:06.900Z" },
        { type: "wealth_factory_worker_claim", event: "claimed", workerInstanceId: "worker-a", tenantId: "tenant-2", runId: "run-5", observedAt: "2026-05-20T06:00:06.950Z" },
        { type: "wealth_factory_worker_run", event: "started", workerInstanceId: "worker-b", tenantId: "tenant-3", runId: "run-6", observedAt: "2026-05-20T06:00:08.000Z" }
      ],
      mode: "global-fairness"
    });

    expect(summary.ok).toBe(true);
    expect(summary.phase).toBe("global_multi_worker_soak_observed");
    expect(summary.workers.cycles).toEqual([
      expect.objectContaining({ cycle: 1, ok: true, phase: "global_multi_worker_fairness_observed" }),
      expect.objectContaining({ cycle: 2, ok: true, phase: "global_multi_worker_fairness_observed" })
    ]);
  });

  it("does not flag a five-cycle staggered six-lane skewed soak when early starts match the queued lane mix for each cycle", () => {
    const requests = expandPressureRequests({
      lanes: [
        { lane: "primary", tenantId: "tenant-1", userId: "user-1", workflowId: "workflow-1", runs: 3 },
        { lane: "secondary", tenantId: "tenant-2", userId: "user-2", workflowId: "workflow-2", runs: 2 },
        { lane: "tertiary", tenantId: "tenant-3", userId: "user-3", workflowId: "workflow-3", runs: 2 },
        { lane: "quaternary", tenantId: "tenant-4", userId: "user-4", workflowId: "workflow-4", runs: 1 },
        { lane: "quinary", tenantId: "tenant-5", userId: "user-5", workflowId: "workflow-5", runs: 1 },
        { lane: "senary", tenantId: "tenant-6", userId: "user-6", workflowId: "workflow-6", runs: 1 }
      ],
      cycles: 5,
      order: "staggered"
    }).map((request: { lane: string; tenantId: string; workflowId: string; cycle: number; sequence: number }, index: number) => ({
      ...request,
      runId: `run-${index + 1}`
    }));

    const snapshots = requests.map((request: { lane: string; tenantId: string; workflowId: string; runId: string }) => ({
      lane: request.lane,
      tenantId: request.tenantId,
      runId: request.runId,
      workflowId: request.workflowId,
      runStatus: "running",
      outboxStatus: "enqueued",
      queueState: "completed",
      observedFirstProgressAt: "2026-05-20T06:00:02.000Z",
      observedFirstStartedAt: "2026-05-20T06:00:02.000Z"
    }));

    const workerEvents = requests.map((request: { tenantId: string; runId: string }, index: number) => ({
      type: "wealth_factory_worker_claim",
      event: "claimed",
      workerInstanceId: index % 3 === 0 ? "worker-a" : index % 3 === 1 ? "worker-b" : "worker-c",
      tenantId: request.tenantId,
      runId: request.runId,
      observedAt: `2026-05-20T06:00:${String(index).padStart(2, "0")}.000Z`
    }));

    const summary = summarizePressureProof({
      requests,
      snapshots,
      workerEvents,
      mode: "global-fairness"
    });

    expect(summary.ok).toBe(true);
    expect(summary.phase).toBe("global_multi_worker_soak_observed");
    expect(summary.workers.cycles).toHaveLength(5);
    expect(summary.workers.cycles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          cycle: 1,
          ok: true,
          phase: "global_multi_worker_fairness_observed"
        }),
        expect.objectContaining({
          cycle: 5,
          ok: true,
          phase: "global_multi_worker_fairness_observed"
        })
      ])
    );
    expect(summary.workers.cycles[0].coverageWindows[1]).toEqual({
      wave: 2,
      windowSize: 6,
      participatingWorkers: 3,
      expectedUniqueLanes: 5,
      uniqueLanesSeen: 5
    });
    expect(summary.workers.cycles.every((cycle: { ok: boolean; phase: string }) => cycle.ok && cycle.phase === "global_multi_worker_fairness_observed")).toBe(true);
  });

  it("flags the specific soak cycle when a later cycle collapses to one worker", () => {
    const summary = summarizePressureProof({
      requests: [
        { lane: "alpha", tenantId: "tenant-1", runId: "run-1", cycle: 1 },
        { lane: "beta", tenantId: "tenant-2", runId: "run-2", cycle: 1 },
        { lane: "alpha", tenantId: "tenant-1", runId: "run-3", cycle: 2 },
        { lane: "beta", tenantId: "tenant-2", runId: "run-4", cycle: 2 }
      ],
      snapshots: [
        { lane: "alpha", tenantId: "tenant-1", runId: "run-1", runStatus: "running", outboxStatus: "enqueued", queueState: "completed", observedFirstProgressAt: "2026-05-20T06:00:02.000Z", observedFirstStartedAt: "2026-05-20T06:00:02.000Z" },
        { lane: "beta", tenantId: "tenant-2", runId: "run-2", runStatus: "running", outboxStatus: "enqueued", queueState: "completed", observedFirstProgressAt: "2026-05-20T06:00:02.100Z", observedFirstStartedAt: "2026-05-20T06:00:02.100Z" },
        { lane: "alpha", tenantId: "tenant-1", runId: "run-3", runStatus: "running", outboxStatus: "enqueued", queueState: "completed", observedFirstProgressAt: "2026-05-20T06:00:07.000Z", observedFirstStartedAt: "2026-05-20T06:00:07.000Z" },
        { lane: "beta", tenantId: "tenant-2", runId: "run-4", runStatus: "running", outboxStatus: "enqueued", queueState: "completed", observedFirstProgressAt: "2026-05-20T06:00:07.100Z", observedFirstStartedAt: "2026-05-20T06:00:07.100Z" }
      ],
      workerEvents: [
        { type: "wealth_factory_worker_claim", event: "claimed", workerInstanceId: "worker-a", tenantId: "tenant-1", runId: "run-1", observedAt: "2026-05-20T06:00:01.900Z" },
        { type: "wealth_factory_worker_claim", event: "claimed", workerInstanceId: "worker-b", tenantId: "tenant-2", runId: "run-2", observedAt: "2026-05-20T06:00:01.950Z" },
        { type: "wealth_factory_worker_claim", event: "claimed", workerInstanceId: "worker-a", tenantId: "tenant-1", runId: "run-3", observedAt: "2026-05-20T06:00:06.900Z" },
        { type: "wealth_factory_worker_claim", event: "claimed", workerInstanceId: "worker-a", tenantId: "tenant-2", runId: "run-4", observedAt: "2026-05-20T06:00:06.950Z" }
      ],
      mode: "global-fairness"
    });

    expect(summary.ok).toBe(false);
    expect(summary.phase).toBe("soak_cycle_distribution_failed");
    expect(summary.notes).toContain("Cycle 2 failed with phase single_worker_only.");
  });
});
