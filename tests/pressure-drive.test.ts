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
          firstProgressAt: "2026-05-20T06:00:01.000Z"
        },
        {
          lane: "secondary",
          tenantId: "tenant-2",
          runId: "run-2",
          runStatus: "running",
          outboxStatus: "enqueued",
          queueState: "active",
          firstProgressAt: "2026-05-20T06:00:02.000Z"
        },
        {
          lane: "primary",
          tenantId: "tenant-1",
          runId: "run-3",
          runStatus: "running",
          outboxStatus: "enqueued",
          queueState: "active",
          firstProgressAt: "2026-05-20T06:00:03.000Z"
        },
        {
          lane: "secondary",
          tenantId: "tenant-2",
          runId: "run-4",
          runStatus: "running",
          outboxStatus: "enqueued",
          queueState: "active",
          firstProgressAt: "2026-05-20T06:00:04.000Z"
        }
      ]
    });

    expect(summary).toEqual({
      ok: true,
      phase: "fair_progress_observed",
      totals: {
        totalRuns: 4,
        byRunStatus: {
          running: 4
        }
      },
      lanes: {
        primary: {
          tenantId: "tenant-1",
          totalRuns: 2,
          byRunStatus: {
            running: 2
          },
          firstProgressAt: "2026-05-20T06:00:01.000Z"
        },
        secondary: {
          tenantId: "tenant-2",
          totalRuns: 2,
          byRunStatus: {
            running: 2
          },
          firstProgressAt: "2026-05-20T06:00:02.000Z"
        }
      },
      notes: [
        "Every requested lane produced at least one progressing run.",
        "Every requested run has produced observable progress.",
        "No lane is completely starved at the current observation point."
      ]
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
          firstProgressAt: "2026-05-20T06:00:01.000Z"
        },
        {
          lane: "secondary",
          tenantId: "tenant-2",
          runId: "run-2",
          runStatus: "queued",
          outboxStatus: "enqueued",
          queueState: "waiting",
          firstProgressAt: null
        }
      ]
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
          firstProgressAt: "2026-05-20T06:00:01.000Z"
        },
        {
          lane: "secondary",
          tenantId: "tenant-2",
          runId: "run-2",
          runStatus: "running",
          outboxStatus: "enqueued",
          queueState: "active",
          firstProgressAt: "2026-05-20T06:00:02.000Z"
        },
        {
          lane: "primary",
          tenantId: "tenant-1",
          runId: "run-3",
          runStatus: "queued",
          outboxStatus: "enqueued",
          queueState: "waiting",
          firstProgressAt: null
        }
      ]
    });

    expect(summary.ok).toBe(false);
    expect(summary.phase).toBe("incomplete_lane_progress");
    expect(summary.notes).toContain("Every lane produced progress, but not every requested run has progressed yet.");
  });
});
