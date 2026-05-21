import { execFile } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { expandPressureRequests } = require("../scripts/lib/pressure-drive.mjs");
const execFileAsync = promisify(execFile);

describe("analyze-worker-fairness script", () => {
  it("combines multiple worker event files when calculating the fairness verdict", async () => {
    const dir = await mkdtemp(join(tmpdir(), "wf-analyze-fairness-"));
    const proofPath = join(dir, "proof.json");
    const workerAPath = join(dir, "worker-a.log");
    const workerBPath = join(dir, "worker-b.log");

    await writeFile(
      proofPath,
      JSON.stringify({
        requests: [
          {
            lane: "primary",
            tenantId: "tenant-a",
            userId: "user-a",
            workflowId: "workflow-a",
            runId: "run-a",
            idempotencyKey: "tenant-a:workflow-a:run-a",
            sequence: 1,
            queuedAt: "2026-05-20T00:00:00.000Z"
          },
          {
            lane: "secondary",
            tenantId: "tenant-b",
            userId: "user-b",
            workflowId: "workflow-b",
            runId: "run-b",
            idempotencyKey: "tenant-b:workflow-b:run-b",
            sequence: 2,
            queuedAt: "2026-05-20T00:00:00.100Z"
          }
        ],
        snapshots: [
          {
            lane: "primary",
            tenantId: "tenant-a",
            runId: "run-a",
            workflowId: "workflow-a",
            runStatus: "running",
            outboxStatus: "enqueued",
            queueState: "completed",
            outboxAttempts: 1,
            queueReachable: true,
            queuedAt: "2026-05-20T00:00:00.000Z",
            observedFirstProgressAt: "2026-05-20T00:00:01.000Z",
            observedFirstStartedAt: "2026-05-20T00:00:02.000Z",
            observedCompletedAt: null
          },
          {
            lane: "secondary",
            tenantId: "tenant-b",
            runId: "run-b",
            workflowId: "workflow-b",
            runStatus: "running",
            outboxStatus: "enqueued",
            queueState: "completed",
            outboxAttempts: 1,
            queueReachable: true,
            queuedAt: "2026-05-20T00:00:00.100Z",
            observedFirstProgressAt: "2026-05-20T00:00:01.100Z",
            observedFirstStartedAt: "2026-05-20T00:00:02.100Z",
            observedCompletedAt: null
          }
        ]
      }),
      "utf8"
    );

    await writeFile(
      workerAPath,
      `${JSON.stringify({
        type: "wealth_factory_worker_claim",
        workerInstanceId: "worker-a",
        observedAt: "2026-05-20T00:00:00.500Z",
        event: "claimed",
        tenantId: "tenant-a",
        runId: "run-a",
        workflowId: "workflow-a"
      })}\n`,
      "utf8"
    );
    await writeFile(
      workerBPath,
      `${JSON.stringify({
        type: "wealth_factory_worker_claim",
        workerInstanceId: "worker-b",
        observedAt: "2026-05-20T00:00:00.600Z",
        event: "claimed",
        tenantId: "tenant-b",
        runId: "run-b",
        workflowId: "workflow-b"
      })}\n`,
      "utf8"
    );

    const { stdout } = await execFileAsync("node", [
      "scripts/analyze-worker-fairness.mjs",
      "--proof",
      proofPath,
      "--worker-events",
      workerAPath,
      "--worker-events",
      workerBPath
    ], {
      cwd: "E:\\REPOS\\spyderbyte_paperclip_saas"
    });

    const result = JSON.parse(stdout);
    expect(result.workerEvents).toHaveLength(2);
    expect(result.summary.workers.distinctWorkers).toEqual(["worker-a", "worker-b"]);
    expect(result.phase).not.toBe("single_worker_only");
  }, 15000);

  it("keeps six requested lanes distinct across multiple worker event files", async () => {
    const dir = await mkdtemp(join(tmpdir(), "wf-analyze-fairness-"));
    const proofPath = join(dir, "proof-six.json");
    const workerAPath = join(dir, "worker-a.log");
    const workerBPath = join(dir, "worker-b.log");
    const workerCPath = join(dir, "worker-c.log");

    const lanes = ["alpha", "beta", "gamma", "delta", "epsilon", "zeta"];
    await writeFile(
      proofPath,
      JSON.stringify({
        requests: lanes.map((lane, index) => ({
          lane,
          tenantId: `tenant-${index + 1}`,
          userId: `user-${index + 1}`,
          workflowId: `workflow-${index + 1}`,
          runId: `run-${index + 1}`,
          idempotencyKey: `tenant-${index + 1}:workflow-${index + 1}:run-${index + 1}`,
          sequence: 1,
          queuedAt: `2026-05-20T00:00:0${index}.000Z`
        })),
        snapshots: lanes.map((lane, index) => ({
          lane,
          tenantId: `tenant-${index + 1}`,
          runId: `run-${index + 1}`,
          workflowId: `workflow-${index + 1}`,
          runStatus: "running",
          outboxStatus: "enqueued",
          queueState: "completed",
          outboxAttempts: 1,
          queueReachable: true,
          queuedAt: `2026-05-20T00:00:0${index}.000Z`,
          observedFirstProgressAt: `2026-05-20T00:00:1${index}.000Z`,
          observedFirstStartedAt: `2026-05-20T00:00:2${index}.000Z`,
          observedCompletedAt: null
        }))
      }),
      "utf8"
    );

    await writeFile(
      workerAPath,
      [
        {
          type: "wealth_factory_worker_claim",
          workerInstanceId: "worker-a",
          observedAt: "2026-05-20T00:00:00.100Z",
          event: "claimed",
          tenantId: "tenant-1",
          runId: "run-1",
          workflowId: "workflow-1"
        },
        {
          type: "wealth_factory_worker_claim",
          workerInstanceId: "worker-a",
          observedAt: "2026-05-20T00:00:00.400Z",
          event: "claimed",
          tenantId: "tenant-4",
          runId: "run-4",
          workflowId: "workflow-4"
        }
      ].map((event) => `${JSON.stringify(event)}\n`).join(""),
      "utf8"
    );
    await writeFile(
      workerBPath,
      [
        {
          type: "wealth_factory_worker_claim",
          workerInstanceId: "worker-b",
          observedAt: "2026-05-20T00:00:00.200Z",
          event: "claimed",
          tenantId: "tenant-2",
          runId: "run-2",
          workflowId: "workflow-2"
        },
        {
          type: "wealth_factory_worker_claim",
          workerInstanceId: "worker-b",
          observedAt: "2026-05-20T00:00:00.500Z",
          event: "claimed",
          tenantId: "tenant-5",
          runId: "run-5",
          workflowId: "workflow-5"
        }
      ].map((event) => `${JSON.stringify(event)}\n`).join(""),
      "utf8"
    );
    await writeFile(
      workerCPath,
      [
        {
          type: "wealth_factory_worker_claim",
          workerInstanceId: "worker-c",
          observedAt: "2026-05-20T00:00:00.300Z",
          event: "claimed",
          tenantId: "tenant-3",
          runId: "run-3",
          workflowId: "workflow-3"
        },
        {
          type: "wealth_factory_worker_claim",
          workerInstanceId: "worker-c",
          observedAt: "2026-05-20T00:00:00.600Z",
          event: "claimed",
          tenantId: "tenant-6",
          runId: "run-6",
          workflowId: "workflow-6"
        }
      ].map((event) => `${JSON.stringify(event)}\n`).join(""),
      "utf8"
    );

    const { stdout } = await execFileAsync("node", [
      "scripts/analyze-worker-fairness.mjs",
      "--proof",
      proofPath,
      "--worker-events",
      workerAPath,
      "--worker-events",
      workerBPath,
      "--worker-events",
      workerCPath
    ], {
      cwd: "E:\\REPOS\\spyderbyte_paperclip_saas"
    });

    const result = JSON.parse(stdout);
    expect(result.workerEvents).toHaveLength(6);
    expect(result.summary.workers.distinctWorkers).toEqual(["worker-a", "worker-b", "worker-c"]);
    expect(Object.keys(result.summary.lanes)).toEqual(["alpha", "beta", "gamma", "delta", "epsilon", "zeta"]);
    expect(result.phase).toBe("global_multi_worker_fairness_observed");
  }, 15000);

  it("parses a proof file captured through npm and PowerShell output wrappers", async () => {
    const dir = await mkdtemp(join(tmpdir(), "wf-analyze-fairness-"));
    const proofPath = join(dir, "proof-banner.json");
    const workerPath = join(dir, "worker.log");

    await writeFile(
      proofPath,
      `\uFEFF\r\n> spyderbyte-paperclip-saas@0.1.0 prove:live-fairness\r\n> node scripts/prove-live-fairness.mjs --mode global-fairness\r\n\r\n${JSON.stringify({
        requests: [
          {
            lane: "primary",
            tenantId: "tenant-a",
            userId: "user-a",
            workflowId: "workflow-a",
            runId: "run-a",
            idempotencyKey: "tenant-a:workflow-a:run-a",
            sequence: 1,
            queuedAt: "2026-05-20T00:00:00.000Z"
          }
        ],
        snapshots: [
          {
            lane: "primary",
            tenantId: "tenant-a",
            runId: "run-a",
            workflowId: "workflow-a",
            runStatus: "running",
            outboxStatus: "enqueued",
            queueState: "completed",
            outboxAttempts: 1,
            queueReachable: true,
            queuedAt: "2026-05-20T00:00:00.000Z",
            observedFirstProgressAt: "2026-05-20T00:00:01.000Z",
            observedFirstStartedAt: "2026-05-20T00:00:02.000Z",
            observedCompletedAt: null
          }
        ]
      })}`,
      "utf8"
    );

    await writeFile(
      workerPath,
      `${JSON.stringify({
        type: "wealth_factory_worker_claim",
        workerInstanceId: "worker-a",
        observedAt: "2026-05-20T00:00:00.500Z",
        event: "claimed",
        tenantId: "tenant-a",
        runId: "run-a",
        workflowId: "workflow-a"
      })}\n`,
      "utf8"
    );

    const { stdout } = await execFileAsync("node", [
      "scripts/analyze-worker-fairness.mjs",
      "--proof",
      proofPath,
      "--worker-events",
      workerPath
    ], {
      cwd: "E:\\REPOS\\spyderbyte_paperclip_saas"
    });

    const result = JSON.parse(stdout);
    expect(result.requests).toHaveLength(1);
    expect(result.phase).toBe("single_worker_only");
  }, 15000);

  it("re-analyzes a five-cycle skewed soak as fair when the queued lane mix only contains five unique lanes in the second early window", async () => {
    const dir = await mkdtemp(join(tmpdir(), "wf-analyze-fairness-"));
    const proofPath = join(dir, "proof-five-cycle.json");
    const workerAPath = join(dir, "worker-a.log");
    const workerBPath = join(dir, "worker-b.log");
    const workerCPath = join(dir, "worker-c.log");

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
    }).map((request: { lane: string; tenantId: string; userId: string; workflowId: string; cycle: number; sequence: number }, index: number) => ({
      ...request,
      runId: `run-${index + 1}`,
      idempotencyKey: `${request.tenantId}:${request.workflowId}:run-${index + 1}`,
      queuedAt: `2026-05-20T00:00:${String(index).padStart(2, "0")}.000Z`
    }));

    await writeFile(
      proofPath,
      JSON.stringify({
        requests,
        snapshots: requests.map((request: { lane: string; tenantId: string; workflowId: string; runId: string; queuedAt: string }) => ({
          lane: request.lane,
          tenantId: request.tenantId,
          runId: request.runId,
          workflowId: request.workflowId,
          runStatus: "running",
          outboxStatus: "enqueued",
          queueState: "completed",
          outboxAttempts: 1,
          queueReachable: true,
          queuedAt: request.queuedAt,
          observedFirstProgressAt: request.queuedAt,
          observedFirstStartedAt: request.queuedAt,
          observedCompletedAt: null
        }))
      }),
      "utf8"
    );

    const eventLines = requests.map((request: { tenantId: string; runId: string; workflowId: string }, index: number) =>
      JSON.stringify({
        type: "wealth_factory_worker_claim",
        workerInstanceId: index % 3 === 0 ? "worker-a" : index % 3 === 1 ? "worker-b" : "worker-c",
        observedAt: `2026-05-20T00:00:${String(index).padStart(2, "0")}.500Z`,
        event: "claimed",
        tenantId: request.tenantId,
        runId: request.runId,
        workflowId: request.workflowId
      })
    );

    await writeFile(workerAPath, eventLines.filter((_: string, index: number) => index % 3 === 0).join("\n") + "\n", "utf8");
    await writeFile(workerBPath, eventLines.filter((_: string, index: number) => index % 3 === 1).join("\n") + "\n", "utf8");
    await writeFile(workerCPath, eventLines.filter((_: string, index: number) => index % 3 === 2).join("\n") + "\n", "utf8");

    const { stdout } = await execFileAsync("node", [
      "scripts/analyze-worker-fairness.mjs",
      "--proof",
      proofPath,
      "--worker-events",
      workerAPath,
      "--worker-events",
      workerBPath,
      "--worker-events",
      workerCPath
    ], {
      cwd: "E:\\REPOS\\spyderbyte_paperclip_saas"
    });

    const result = JSON.parse(stdout);
    expect(result.phase).toBe("global_multi_worker_soak_observed");
    expect(result.summary.workers.cycles).toHaveLength(5);
    expect(result.summary.workers.cycles.every((cycle: { ok: boolean; phase: string }) => cycle.ok && cycle.phase === "global_multi_worker_fairness_observed")).toBe(true);
    expect(result.summary.workers.cycles[0].coverageWindows[1]).toEqual({
      wave: 2,
      windowSize: 6,
      participatingWorkers: 3,
      expectedUniqueLanes: 5,
      uniqueLanesSeen: 5
    });
  }, 15000);
});
