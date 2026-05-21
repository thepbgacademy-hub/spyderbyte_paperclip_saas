import { createRequire } from "node:module";

import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const {
  buildRemoteDockerStatsCommand,
  buildRemoteQueueSnapshotCommand,
  buildCapacityVerdict,
  DEFAULT_SATURATION_THRESHOLDS,
  parseSecretFileContents,
  parseRemoteQueueSnapshotStdout,
  splitCollectorAndProofArgs,
  summarizeCapacityPressure,
  tagDockerStatsSamples
} = require("../scripts/lib/live-soak-capacity.mjs");

describe("live soak capacity helpers", () => {
  it("builds the remote docker stats and queue snapshot commands", () => {
    expect(buildRemoteDockerStatsCommand()).toBe("docker stats --no-stream --format '{{json .}}'");
    expect(buildRemoteQueueSnapshotCommand({ queueContainer: "wealth-factory-api-stage2" })).toBe(
      "docker exec wealth-factory-api-stage2 node scripts/inspect-live-queue-snapshot.mjs"
    );
  });

  it("extracts the actual secret from either labeled helper text or a raw single-line file", () => {
    expect(parseSecretFileContents("[sudo] password for deploy: super-secret\npassphrase: ignored\n")).toBe("super-secret");
    expect(parseSecretFileContents("raw-secret-value\n")).toBe("raw-secret-value");
  });

  it("splits collector args from forwarded fairness proof args at --", () => {
    expect(
      splitCollectorAndProofArgs([
        "--ssh-target",
        "deploy@example",
        "--interval-ms",
        "10000",
        "--",
        "--mode",
        "global-fairness",
        "--cycles",
        "10"
      ])
    ).toEqual({
      collectorArgs: ["--ssh-target", "deploy@example", "--interval-ms", "10000"],
      proofArgs: ["--mode", "global-fairness", "--cycles", "10"]
    });
  });

  it("tags parsed docker stats lines with a collection timestamp", () => {
    expect(
      tagDockerStatsSamples('{"Name":"paperclip","CPUPerc":"210.0%","MemPerc":"12.5%","MemUsage":"2.0GiB / 16.0GiB","PIDs":"1200"}\ninvalid', {
        observedAt: "2026-05-21T12:00:00.000Z"
      })
    ).toEqual([
      {
        observedAt: "2026-05-21T12:00:00.000Z",
        name: "paperclip",
        cpuPercent: 210,
        memoryPercent: 12.5,
        memoryUsageBytes: 2147483648,
        memoryLimitBytes: 17179869184,
        pids: 1200
      }
    ]);
  });

  it("parses remote queue snapshot output even when SSH prepends banner noise", () => {
    expect(
      parseRemoteQueueSnapshotStdout(
        "Pseudo-terminal will not be allocated because stdin is not a terminal.\n{\"observedAt\":\"2026-05-21T12:00:00.000Z\",\"queueName\":\"wfpc-workflow-runs\",\"reachable\":true,\"error\":null,\"counts\":{\"waiting\":1,\"active\":2,\"completed\":3,\"failed\":0,\"delayed\":0,\"paused\":0,\"prioritized\":0,\"waitingChildren\":0}}\n",
        {
          observedAt: "2026-05-21T12:00:05.000Z"
        }
      )
    ).toEqual({
      observedAt: "2026-05-21T12:00:05.000Z",
      queueName: "wfpc-workflow-runs",
      reachable: true,
      error: null,
      counts: {
        waiting: 1,
        active: 2,
        completed: 3,
        failed: 0,
        delayed: 0,
        paused: 0,
        prioritized: 0,
        waitingChildren: 0
      }
    });
  });

  it("highlights containers that stay hot across a sustained soak", () => {
    const summary = summarizeCapacityPressure({
      dockerSamples: [
        { name: "paperclip", observedAt: "2026-05-21T12:00:00.000Z", cpuPercent: 260, memoryUsageBytes: 2_300_000_000, memoryPercent: 14.5, pids: 780 },
        { name: "paperclip", observedAt: "2026-05-21T12:00:10.000Z", cpuPercent: 315, memoryUsageBytes: 2_450_000_000, memoryPercent: 15.1, pids: 840 },
        { name: "paperclip", observedAt: "2026-05-21T12:00:20.000Z", cpuPercent: 340, memoryUsageBytes: 2_500_000_000, memoryPercent: 15.4, pids: 910 },
        { name: "worker-a", observedAt: "2026-05-21T12:00:00.000Z", cpuPercent: 12, memoryUsageBytes: 32_000_000, memoryPercent: 0.2, pids: 11 }
      ],
      queueSnapshots: [],
      focusContainers: ["paperclip"]
    });

    expect(summary.thresholds).toEqual(DEFAULT_SATURATION_THRESHOLDS);
    expect(summary.focus.paperclip).toMatchObject({
      samples: 3,
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
      }
    });
    expect(summary.concerningContainers).toEqual(["paperclip"]);
    expect(summary.notes).toContain(
      "paperclip exceeded at least one saturation threshold with sustained duration during the soak window."
    );
  });

  it("does not label a single-sample hotspot blip as sustained saturation", () => {
    const summary = summarizeCapacityPressure({
      dockerSamples: [
        { name: "paperclip", observedAt: "2026-05-21T12:00:00.000Z", cpuPercent: 320, memoryUsageBytes: 2_500_000_000, memoryPercent: 15.2, pids: 900 },
        { name: "paperclip", observedAt: "2026-05-21T12:00:10.000Z", cpuPercent: 40, memoryUsageBytes: 400_000_000, memoryPercent: 2, pids: 80 }
      ],
      queueSnapshots: []
    });

    expect(summary.focus.paperclip.hotSamples.any).toBe(1);
    expect(summary.concerningContainers).toEqual([]);
  });

  it("defaults verdict scope to all observed containers when no focus override is supplied", () => {
    const summary = summarizeCapacityPressure({
      dockerSamples: [
        { name: "paperclip", observedAt: "2026-05-21T12:00:00.000Z", cpuPercent: 20, memoryUsageBytes: 300_000_000, memoryPercent: 2, pids: 80 },
        { name: "redis-stage", observedAt: "2026-05-21T12:00:00.000Z", cpuPercent: 300, memoryUsageBytes: 2_400_000_000, memoryPercent: 10, pids: 900 },
        { name: "redis-stage", observedAt: "2026-05-21T12:00:10.000Z", cpuPercent: 320, memoryUsageBytes: 2_500_000_000, memoryPercent: 10.5, pids: 920 },
        { name: "redis-stage", observedAt: "2026-05-21T12:00:20.000Z", cpuPercent: 310, memoryUsageBytes: 2_450_000_000, memoryPercent: 10.2, pids: 910 }
      ],
      queueSnapshots: []
    });

    expect(Object.keys(summary.focus)).toEqual(["paperclip", "redis-stage"]);
    expect(summary.concerningContainers).toEqual(["redis-stage"]);
  });

  it("keeps global fairness capture runs pending until offline analysis is complete", () => {
    expect(
      buildCapacityVerdict({
        proofResult: {
          ok: false,
          analysisPending: true,
          phase: "global_multi_worker_capture_complete"
        },
        proofExitResult: { code: 0, signal: null },
        proofParseError: null,
        dockerSampleCount: 3,
        queueSnapshotCount: 3,
        queueReachableSamples: 3,
        queueEvidenceValid: true,
        concerningContainers: []
      })
    ).toEqual(["fairness_proof_analysis_pending"]);
  });
});
