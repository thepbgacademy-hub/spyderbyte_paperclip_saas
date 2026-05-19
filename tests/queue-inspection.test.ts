import { createRequire } from "node:module";

import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const { inspectQueueState } = require("../scripts/lib/queue-inspection.mjs");

describe("queue inspection", () => {
  it("returns queue state when Redis and BullMQ are reachable", async () => {
    const job = {
      getState: vi.fn().mockResolvedValue("waiting")
    };
    const queue = {
      getJob: vi.fn().mockResolvedValue(job),
      close: vi.fn().mockResolvedValue(undefined)
    };
    const connection = {
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn(),
      on: vi.fn()
    };
    const QueueClass = vi.fn().mockImplementation(() => queue);
    const RedisClass = vi.fn().mockImplementation(() => connection);

    await expect(
      inspectQueueState({
        redisUrl: "redis://queue.internal:6379",
        queueName: "wfpc-workflow-runs",
        jobId: "tenant-1:workflow-1:run-1",
        QueueClass,
        RedisClass
      })
    ).resolves.toEqual({
      queueName: "wfpc-workflow-runs",
      jobId: "tenant-1:workflow-1:run-1",
      state: "waiting",
      reachable: true,
      error: null
    });
  });

  it("degrades cleanly when Redis is unreachable from the caller", async () => {
    const connection = {
      connect: vi.fn().mockRejectedValue(new Error("connect ECONNREFUSED 10.0.0.5:6379")),
      disconnect: vi.fn(),
      on: vi.fn()
    };
    const RedisClass = vi.fn().mockImplementation(() => connection);

    await expect(
      inspectQueueState({
        redisUrl: "redis://queue.internal:6379",
        queueName: "wfpc-workflow-runs",
        jobId: "tenant-1:workflow-1:run-1",
        RedisClass
      })
    ).resolves.toEqual({
      queueName: "wfpc-workflow-runs",
      jobId: "tenant-1:workflow-1:run-1",
      state: null,
      reachable: false,
      error: "connect ECONNREFUSED 10.0.0.5:6379"
    });
  });
});
