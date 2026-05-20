import { createRequire } from "node:module";

import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { createPressureRequests, summarizePressureProof } = require("../scripts/lib/pressure-drive.mjs");

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
});
