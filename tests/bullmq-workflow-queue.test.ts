import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createBullmqSafeJobId,
  createBullmqWorkflowConsumer,
  createBullmqWorkflowRunEnqueuer
} from "../src/workflows/bullmq-workflow-queue.js";
import { WorkerRuntimeClosingError } from "../src/worker/runtime-closing-error.js";

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
  UnrecoverableError: class UnrecoverableError extends Error {
    constructor(message = "bullmq:unrecoverable") {
      super(message);
      this.name = "UnrecoverableError";
    }
  },
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
    const idempotencyKey = "tenant-1:workflow-1:run-1";

    const enqueuer = createBullmqWorkflowRunEnqueuer({
      redisUrl: "redis://localhost:6379",
      queueName: "wfpc-workflow-runs"
    });

    await expect(
      enqueuer.enqueueOnce({
        tenantId: "tenant-1",
        userId: "user-1",
        workflowId: "workflow-1",
        workflowTemplateId: "workflow-1",
        runId: "run-1",
        idempotencyKey
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
      {
        jobId: createBullmqSafeJobId(idempotencyKey)
      }
    );
    expect(mocks.queueCtor).toHaveBeenCalledWith(
      "wfpc-workflow-runs",
      expect.objectContaining({
        defaultJobOptions: expect.objectContaining({
          attempts: 2,
          backoff: { type: "fixed", delay: 5_000 },
          removeOnComplete: 1_000,
          removeOnFail: 5_000
        })
      })
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
        workflowId: "workflow-1",
        workflowTemplateId: "workflow-1",
        runId: "run-1",
        idempotencyKey: "tenant-1:workflow-1:run-1"
      })
    ).resolves.toBe("already_queued");
  });

  it("uses a BullMQ-safe deterministic job id while preserving the original idempotency key in the payload", async () => {
    mocks.add.mockResolvedValue({ id: "job-redispatch-1" });
    const idempotencyKey = "tenant-1:workflow-1:run-1:redispatch:resume_lane:abc123def456";

    const enqueuer = createBullmqWorkflowRunEnqueuer({
      redisUrl: "redis://localhost:6379",
      queueName: "wfpc-workflow-runs"
    });

    await expect(
      enqueuer.enqueueOnce({
        tenantId: "tenant-1",
        userId: "user-1",
        workflowId: "workflow-1",
        workflowTemplateId: "workflow-1",
        runId: "run-1",
        idempotencyKey
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
      {
        jobId: createBullmqSafeJobId(idempotencyKey)
      }
    );
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
    ).rejects.toMatchObject({ name: "UnrecoverableError", message: "boom" });

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

  it("emits claimed and failed job events when the runtime rejects work because shutdown already began", async () => {
    const failure = new WorkerRuntimeClosingError();
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
        id: "job-shutdown",
        data: {
          tenantId: "tenant-1",
          runId: "run-2",
          workflowId: "workflow-2",
          createdByUserId: "user-1",
          idempotencyKey: "tenant-1:workflow-2:run-2",
          createdAt: new Date().toISOString()
        }
      })
    ).rejects.toMatchObject({ name: "WorkerRuntimeClosingError", message: "Worker runtime is closing" });

    expect(onJobEvent).toHaveBeenNthCalledWith(
      1,
      "claimed",
      expect.objectContaining({ jobId: "job-shutdown" })
    );
    expect(onJobEvent).toHaveBeenNthCalledWith(
      2,
      "failed",
      expect.objectContaining({ jobId: "job-shutdown", error: failure })
    );

    await consumer.close();
  });

  it("still closes BullMQ resources cleanly after worker startup rejects", async () => {
    const startupFailure = new Error("worker bootstrap failed");
    mocks.workerRun.mockRejectedValueOnce(startupFailure);

    const consumer = createBullmqWorkflowConsumer({
      redisUrl: "redis://localhost:6379",
      queueName: "wfpc-workflow-runs",
      concurrency: 1,
      processPayload: vi.fn().mockResolvedValue({ status: "queued" })
    });

    await expect(consumer.start()).rejects.toThrow("worker bootstrap failed");

    await consumer.close();

    expect(mocks.workerClose).toHaveBeenCalledOnce();
    expect(mocks.redisQuit).toHaveBeenCalledOnce();
  });

  it("emits claimed and failed job events when launch succeeds but status recording fails afterward", async () => {
    const failure = new Error("status recorder unavailable after launch");
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
        id: "job-late-status-failure",
        data: {
          tenantId: "tenant-1",
          runId: "run-3",
          workflowId: "workflow-3",
          createdByUserId: "user-1",
          idempotencyKey: "tenant-1:workflow-3:run-3",
          createdAt: new Date().toISOString()
        }
      })
    ).rejects.toMatchObject({ name: "UnrecoverableError", message: "status recorder unavailable after launch" });

    expect(onJobEvent).toHaveBeenNthCalledWith(
      1,
      "claimed",
      expect.objectContaining({ jobId: "job-late-status-failure" })
    );
    expect(onJobEvent).toHaveBeenNthCalledWith(
      2,
      "failed",
      expect.objectContaining({ jobId: "job-late-status-failure", error: failure })
    );

    await consumer.close();
  });

  it("keeps a plain Error with the closing message on the unrecoverable path", async () => {
    const failure = new Error("Worker runtime is closing");
    const processPayload = vi.fn().mockRejectedValue(failure);
    const consumer = createBullmqWorkflowConsumer({
      redisUrl: "redis://localhost:6379",
      queueName: "wfpc-workflow-runs",
      concurrency: 1,
      processPayload
    });

    const processor = mocks.workerCtor.mock.results.at(-1)?.value.__processor as (job: { id?: string; data: unknown }) => Promise<unknown>;
    await expect(
      processor({
        id: "job-stringly-closing",
        data: {
          tenantId: "tenant-1",
          runId: "run-4",
          workflowId: "workflow-4",
          createdByUserId: "user-1",
          idempotencyKey: "tenant-1:workflow-4:run-4",
          createdAt: new Date().toISOString()
        }
      })
    ).rejects.toMatchObject({ name: "UnrecoverableError", message: "Worker runtime is closing" });

    await consumer.close();
  });
});
