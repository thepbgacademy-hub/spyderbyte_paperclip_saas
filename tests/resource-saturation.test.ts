import { createRequire } from "node:module";

import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const {
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
        byContainer: {
          "worker-a": {
            samples: 2,
            maxCpuPercent: 37.2,
            maxMemoryUsageBytes: 4096,
            maxMemoryPercent: 2.2,
            maxPids: 10
          },
          "worker-b": {
            samples: 1,
            maxCpuPercent: 20.5,
            maxMemoryUsageBytes: 2048,
            maxMemoryPercent: 1.8,
            maxPids: 6
          }
        },
        maxCpuPercent: 37.2,
        maxMemoryUsageBytes: 4096,
        maxMemoryPercent: 2.2,
        maxPids: 10
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
        byContainer: {},
        maxCpuPercent: 0,
        maxMemoryUsageBytes: 0,
        maxMemoryPercent: 0,
        maxPids: 0
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
});
