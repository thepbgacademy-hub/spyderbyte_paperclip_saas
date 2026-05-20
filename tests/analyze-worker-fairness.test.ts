import { execFile } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

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
});
