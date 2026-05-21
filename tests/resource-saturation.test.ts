import { createRequire } from "node:module";

import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const {
  DEFAULT_SATURATION_THRESHOLDS,
  normalizeDockerSample,
  parseDockerStatsDocument,
  parseQueueSnapshotsDocument,
  summarizeResourceSaturation
} = require("../scripts/lib/resource-saturation.mjs");

describe("resource saturation helpers", () => {
  it("normalizes docker stats samples into numeric saturation values", () => {
    expect(
      normalizeDockerSample({
        observedAt: "2026-05-20T12:00:00.000Z",
        Name: "wealth-factory-worker-proof-a",
        CPUPerc: "42.5%",
        MemPerc: "3.10%",
        MemUsage: "512MiB / 15.6GiB",
        PIDs: "12"
      })
    ).toEqual({
      observedAt: "2026-05-20T12:00:00.000Z",
      name: "wealth-factory-worker-proof-a",
      cpuPercent: 42.5,
      memoryPercent: 3.1,
      memoryUsageBytes: 536870912,
      memoryLimitBytes: 16750372454,
      pids: 12
    });
  });

  it("parses docker stats and queue snapshot documents", () => {
    expect(
      parseDockerStatsDocument('{"Name":"worker-a","CPUPerc":"12.3%","MemPerc":"1.2%","MemUsage":"256MiB / 1GiB","PIDs":"8"}\nignored')
    ).toEqual([
      {
        observedAt: null,
        name: "worker-a",
        cpuPercent: 12.3,
        memoryPercent: 1.2,
        memoryUsageBytes: 268435456,
        memoryLimitBytes: 1073741824,
        pids: 8
      }
    ]);

    expect(
      parseQueueSnapshotsDocument('{"observedAt":"2026-05-20T12:00:00.000Z","reachable":true,"counts":{"waiting":4,"active":2,"completed":9,"failed":1,"delayed":0,"paused":0,"prioritized":0,"waitingChildren":0}}\n')
    ).toEqual([
      {
        observedAt: "2026-05-20T12:00:00.000Z",
        reachable: true,
        counts: {
          waiting: 4,
          active: 2,
          completed: 9,
          failed: 1,
          delayed: 0,
          paused: 0,
          prioritized: 0,
          waitingChildren: 0
        }
      }
    ]);
  });

  it("summarizes docker and queue saturation high-water marks", () => {
    expect(
      summarizeResourceSaturation({
        dockerSamples: [
          {
            name: "worker-a",
            cpuPercent: 12.5,
            memoryUsageBytes: 1024,
            memoryPercent: 1.1,
            pids: 8
          },
          {
            name: "worker-a",
            cpuPercent: 37.2,
            memoryUsageBytes: 4096,
            memoryPercent: 2.2,
            pids: 10
          },
          {
            name: "worker-b",
            cpuPercent: 20.5,
            memoryUsageBytes: 2048,
            memoryPercent: 1.8,
            pids: 6
          }
        ],
        queueSnapshots: [
          {
            observedAt: "2026-05-20T12:00:00.000Z",
            reachable: true,
            counts: {
              waiting: 5,
              active: 2,
              completed: 1,
              failed: 0,
              delayed: 1,
              paused: 0,
              prioritized: 0,
              waitingChildren: 0
            }
          },
          {
            observedAt: "2026-05-20T12:00:10.000Z",
            reachable: false,
            counts: null
          },
          {
            observedAt: "2026-05-20T12:00:20.000Z",
            reachable: true,
            counts: {
              waiting: 3,
              active: 4,
              completed: 8,
              failed: 1,
              delayed: 0,
              paused: 0,
              prioritized: 2,
              waitingChildren: 1
            }
          }
        ]
      })
    ).toEqual({
      docker: {
        samples: 3,
        valid: true,
        thresholds: DEFAULT_SATURATION_THRESHOLDS,
        byContainer: {
          "worker-a": {
            samples: 2,
            avgCpuPercent: 24.85,
            avgMemoryUsageBytes: 2560,
            avgMemoryPercent: 1.65,
            avgPids: 9,
            maxCpuPercent: 37.2,
            maxMemoryUsageBytes: 4096,
            maxMemoryPercent: 2.2,
            maxPids: 10,
            hotSamples: {
              cpuPercent: 0,
              memoryUsageBytes: 0,
              pids: 0,
              any: 0
            },
            longestHotStreaks: {
              cpuPercent: 0,
              memoryUsageBytes: 0,
              pids: 0,
              any: 0
            },
            hotSampleRatios: {
              cpuPercent: 0,
              memoryUsageBytes: 0,
              pids: 0,
              any: 0
            }
          },
          "worker-b": {
            samples: 1,
            avgCpuPercent: 20.5,
            avgMemoryUsageBytes: 2048,
            avgMemoryPercent: 1.8,
            avgPids: 6,
            maxCpuPercent: 20.5,
            maxMemoryUsageBytes: 2048,
            maxMemoryPercent: 1.8,
            maxPids: 6,
            hotSamples: {
              cpuPercent: 0,
              memoryUsageBytes: 0,
              pids: 0,
              any: 0
            },
            longestHotStreaks: {
              cpuPercent: 0,
              memoryUsageBytes: 0,
              pids: 0,
              any: 0
            },
            hotSampleRatios: {
              cpuPercent: 0,
              memoryUsageBytes: 0,
              pids: 0,
              any: 0
            }
          }
        },
        maxCpuPercent: 37.2,
        maxMemoryUsageBytes: 4096,
        maxMemoryPercent: 2.2,
        maxPids: 10,
        hotContainers: []
      },
      queue: {
        samples: 3,
        reachableSamples: 2,
        unreachableSamples: 1,
        valid: false,
        highWaterMarks: {
          waiting: 5,
          active: 4,
          completed: 8,
          failed: 1,
          delayed: 1,
          paused: 0,
          prioritized: 2,
          waitingChildren: 1
        }
      }
    });
  });

  it("marks empty docker and unreachable queue inputs as invalid instead of implying a healthy zero-load summary", () => {
    expect(
      summarizeResourceSaturation({
        dockerSamples: [],
        queueSnapshots: [
          {
            observedAt: "2026-05-20T12:00:10.000Z",
            reachable: false,
            counts: null
          }
        ]
      })
    ).toEqual({
      docker: {
        samples: 0,
        valid: false,
        thresholds: DEFAULT_SATURATION_THRESHOLDS,
        byContainer: {},
        maxCpuPercent: 0,
        maxMemoryUsageBytes: 0,
        maxMemoryPercent: 0,
        maxPids: 0,
        hotContainers: []
      },
      queue: {
        samples: 1,
        reachableSamples: 0,
        unreachableSamples: 1,
        valid: false,
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
      }
    });
  });

  it("preserves missing queue counts as null so malformed queue samples do not masquerade as empty healthy telemetry", () => {
    expect(
      parseQueueSnapshotsDocument('{"observedAt":"2026-05-20T12:00:00.000Z","reachable":true,"counts":null}\n')
    ).toEqual([
      {
        observedAt: "2026-05-20T12:00:00.000Z",
        reachable: true,
        counts: null
      }
    ]);

    expect(
      summarizeResourceSaturation({
        dockerSamples: [],
        queueSnapshots: [
          {
            observedAt: "2026-05-20T12:00:00.000Z",
            reachable: true,
            counts: null
          }
        ]
      }).queue
    ).toEqual({
      samples: 1,
      reachableSamples: 0,
      unreachableSamples: 0,
      valid: false,
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
    });
  });

  it("tracks sustained hotspot ratios and streaks for containers that stay hot across multiple samples", () => {
    expect(
      summarizeResourceSaturation({
        dockerSamples: [
          { name: "paperclip", cpuPercent: 260, memoryUsageBytes: 2_300_000_000, memoryPercent: 14.5, pids: 780 },
          { name: "paperclip", cpuPercent: 315, memoryUsageBytes: 2_450_000_000, memoryPercent: 15.1, pids: 840 },
          { name: "paperclip", cpuPercent: 340, memoryUsageBytes: 2_500_000_000, memoryPercent: 15.4, pids: 910 }
        ],
        queueSnapshots: []
      }).docker.byContainer.paperclip
    ).toMatchObject({
      samples: 3,
      avgCpuPercent: 305,
      hotSamples: {
        cpuPercent: 3,
        memoryUsageBytes: 3,
        pids: 2,
        any: 3
      },
      longestHotStreaks: {
        cpuPercent: 3,
        memoryUsageBytes: 3,
        pids: 2,
        any: 3
      },
      hotSampleRatios: {
        cpuPercent: 1,
        memoryUsageBytes: 1,
        pids: 0.6667,
        any: 1
      }
    });
  });
});
