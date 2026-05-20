import { afterEach, describe, expect, it, vi } from "vitest";

import { createBullmqWorkflowConsumer, createBullmqWorkflowRunEnqueuer } from "../src/workflows/bullmq-workflow-queue.js";

const mocks = vi.hoisted(() => ({
  add: vi.fn(),
  queueClose: vi.fn().mockResolvedValue(undefined),
  workerRun: vi.fn().mockResolvedValue(undefined),
  workerClose: vi.fn().mockResolvedValue(undefined),
  workerWaitUntilReady: vi.fn().mockResolvedValue(undefined),
  workerOn: vi.fn(),
  redisQuit: vi.fn().mockResolvedValue("OK"),
  queueCtor: vi.fn(),
  workerCtor: vi.fn(),
  redisCtor: vi.fn()
}));

vi.mock("bullmq", () => ({
  Queue: mocks.queueCtor.mockImplementation(() => ({
    add: mocks.add,
    close: mocks.queueClose
  })),
  Worker: mocks.workerCtor.mockImplementation((_name, processor) => ({
    run: mocks.workerRun,
    close: mocks.workerClose,
    waitUntilReady: mocks.workerWaitUntilReady,
    on: mocks.workerOn,
    __processor: processor
  }))
}));

vi.mock("ioredis", () => ({
  Redis: mocks.redisCtor.mockImplementation(() => ({
    quit: mocks.redisQuit
  }))
}));

afterEach(() => {
  vi.clearAllMocks();
});

describe("bullmq workflow queue", () => {
  it("maps reservation inputs to safe BullMQ payloads", async () => {
    mocks.add.mockResolvedValue({ id: "job-1" });

    const enqueuer = createBullmqWorkflowRunEnqueuer({
      redisUrl: "redis://localhost:6379",
      queueName: "wfpc-workflow-runs"
    });

    await expect(
      enqueuer.enqueueOnce({
        tenantId: "tenant-1",
        userId: "user-1",
        workflowTemplateId: "workflow-1",
        runId: "run-1",
        idempotencyKey: "tenant-1:workflow-1:run-1"
      })
    ).resolves.toBe("enqueued");

    expect(mocks.add).toHaveBeenCalledWith(
      "workflow-run",
      expect.objectContaining({
        tenantId: "tenant-1",
        workflowId: "workflow-1",
        createdByUserId: "user-1",
        runId: "run-1",
        idempotencyKey: "tenant-1:workflow-1:run-1"
      }),
      { jobId: "tenant-1:workflow-1:run-1" }
    );

    await enqueuer.close();
    expect(mocks.queueClose).toHaveBeenCalledOnce();
    expect(mocks.redisQuit).toHaveBeenCalledOnce();
  });

  it("treats duplicate BullMQ job ids as already queued", async () => {
    mocks.add.mockRejectedValue(new Error("Job with this id already exists"));

    const enqueuer = createBullmqWorkflowRunEnqueuer({
      redisUrl: "redis://localhost:6379",
      queueName: "wfpc-workflow-runs"
    });

    await expect(
      enqueuer.enqueueOnce({
        tenantId: "tenant-1",
        userId: "user-1",
        workflowTemplateId: "workflow-1",
        runId: "run-1",
        idempotencyKey: "tenant-1:workflow-1:run-1"
      })
    ).resolves.toBe("already_queued");
  });

  it("starts a BullMQ worker that forwards queue payloads into the workflow runtime", async () => {
    const processPayload = vi.fn().mockResolvedValue({ status: "queued" });
    const onJobEvent = vi.fn();
    const consumer = createBullmqWorkflowConsumer({
      redisUrl: "redis://localhost:6379",
      queueName: "wfpc-workflow-runs",
      concurrency: 2,
      processPayload,
      onJobEvent
    });

    expect(mocks.workerCtor).toHaveBeenCalledWith(
      "wfpc-workflow-runs",
      expect.any(Function),
      expect.objectContaining({
        concurrency: 2,
        autorun: false
      })
    );

    const processor = mocks.workerCtor.mock.results[0]?.value.__processor as (job: { data: unknown }) => Promise<unknown>;
    await expect(
      processor({
        data: {
          tenantId: "tenant-1",
          runId: "run-1",
          workflowId: "workflow-1",
          createdByUserId: "user-1",
          idempotencyKey: "tenant-1:workflow-1:run-1",
          createdAt: new Date().toISOString()
        }
      })
    ).resolves.toEqual({ status: "queued" });
    expect(processPayload).toHaveBeenCalledOnce();
    expect(onJobEvent).toHaveBeenNthCalledWith(
      1,
      "claimed",
      expect.objectContaining({
        jobId: null,
        payload: expect.objectContaining({
          tenantId: "tenant-1",
          runId: "run-1"
        })
      })
    );
    expect(onJobEvent).toHaveBeenNthCalledWith(
      2,
      "completed",
      expect.objectContaining({
        jobId: null,
        payload: expect.objectContaining({
          workflowId: "workflow-1"
        })
      })
    );

    await consumer.start();
    expect(mocks.workerRun).toHaveBeenCalledOnce();
    await consumer.waitUntilReady();
    expect(mocks.workerWaitUntilReady).toHaveBeenCalledOnce();

    await consumer.close();
    expect(mocks.workerClose).toHaveBeenCalledOnce();
    expect(mocks.redisQuit).toHaveBeenCalled();
  });

  it("emits a failed job event when processing throws", async () => {
    const failure = new Error("boom");
    const processPayload = vi.fn().mockRejectedValue(failure);
    const onJobEvent = vi.fn();
    const consumer = createBullmqWorkflowConsumer({
      redisUrl: "redis://localhost:6379",
      queueName: "wfpc-workflow-runs",
      concurrency: 1,
      processPayload,
      onJobEvent
    });

    const processor = mocks.workerCtor.mock.results.at(-1)?.value.__processor as (job: { id?: string; data: unknown }) => Promise<unknown>;
    await expect(
      processor({
        id: "job-1",
        data: {
          tenantId: "tenant-1",
          runId: "run-1",
          workflowId: "workflow-1",
          createdByUserId: "user-1",
          idempotencyKey: "tenant-1:workflow-1:run-1",
          createdAt: new Date().toISOString()
        }
      })
    ).rejects.toThrow("boom");

    expect(onJobEvent).toHaveBeenNthCalledWith(
      1,
      "claimed",
      expect.objectContaining({ jobId: "job-1" })
    );
    expect(onJobEvent).toHaveBeenNthCalledWith(
      2,
      "failed",
      expect.objectContaining({ jobId: "job-1", error: failure })
    );

    await consumer.close();
  });
});
