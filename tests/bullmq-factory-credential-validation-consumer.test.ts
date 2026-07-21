import { afterEach, describe, expect, it, vi } from "vitest";

import { createBullmqFactoryCredentialValidationConsumer } from "../src/factory/queues/bullmq-factory-credential-validation-consumer.js";

const mocks = vi.hoisted(() => ({
  workerRun: vi.fn().mockResolvedValue(undefined),
  workerClose: vi.fn().mockResolvedValue(undefined),
  workerWaitUntilReady: vi.fn().mockResolvedValue(undefined),
  workerOn: vi.fn(),
  redisQuit: vi.fn().mockResolvedValue("OK"),
  workerCtor: vi.fn(),
  redisCtor: vi.fn()
}));

vi.mock("bullmq", () => ({
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

describe("bullmq factory credential validation consumer", () => {
  it("uses the isolated Wealth Factory queue namespace by default and rejects legacy namespaces", () => {
    const consumer = createBullmqFactoryCredentialValidationConsumer({
      redisUrl: "redis://localhost:6379",
      concurrency: 3,
      processPayload: vi.fn().mockResolvedValue(undefined)
    });

    expect(consumer.config).toEqual({
      queueName: "wealth-factory-validations-v1",
      prefix: "wealth-factory-blueprint-v1"
    });
    expect(mocks.workerCtor).toHaveBeenCalledWith(
      "wealth-factory-validations-v1",
      expect.any(Function),
      expect.objectContaining({
        prefix: "wealth-factory-blueprint-v1",
        concurrency: 3,
        autorun: false
      })
    );

    expect(() =>
      createBullmqFactoryCredentialValidationConsumer({
        redisUrl: "redis://localhost:6379",
        concurrency: 1,
        config: {
          queueName: "wfpc-workflow-runs"
        },
        processPayload: vi.fn().mockResolvedValue(undefined)
      })
    ).toThrow("Factory queue name must not reuse a legacy queue namespace");
  });

  it("passes the exact payload through to the processor and emits claimed and completed events", async () => {
    const payload = { jobId: "credential_validation_1" };
    const processPayload = vi.fn().mockResolvedValue({ status: "ok" });
    const onJobEvent = vi.fn();
    createBullmqFactoryCredentialValidationConsumer({
      redisUrl: "redis://localhost:6379",
      concurrency: 2,
      processPayload,
      onJobEvent
    });

    const processor = mocks.workerCtor.mock.results[0]?.value.__processor as (job: {
      id?: string;
      data: { jobId: string };
    }) => Promise<unknown>;

    await expect(
      processor({
        data: payload
      })
    ).resolves.toEqual({ status: "ok" });

    expect(processPayload).toHaveBeenCalledWith(payload);
    expect(processPayload.mock.calls[0]?.[0]).toBe(payload);
    expect(onJobEvent).toHaveBeenNthCalledWith(1, "claimed", {
      jobId: null,
      payload
    });
    expect(onJobEvent).toHaveBeenNthCalledWith(2, "completed", {
      jobId: null,
      payload
    });
  });

  it("emits failed events and rethrows the original error when processing fails", async () => {
    const payload = { jobId: "credential_validation_2" };
    const failure = new Error("validation failed");
    const processPayload = vi.fn().mockRejectedValue(failure);
    const onJobEvent = vi.fn();
    createBullmqFactoryCredentialValidationConsumer({
      redisUrl: "redis://localhost:6379",
      concurrency: 1,
      processPayload,
      onJobEvent
    });

    const processor = mocks.workerCtor.mock.results[0]?.value.__processor as (job: {
      id?: string;
      data: { jobId: string };
    }) => Promise<unknown>;

    await expect(
      processor({
        id: "bull-job-2",
        data: payload
      })
    ).rejects.toBe(failure);

    expect(onJobEvent).toHaveBeenNthCalledWith(1, "claimed", {
      jobId: "bull-job-2",
      payload
    });
    expect(onJobEvent).toHaveBeenNthCalledWith(2, "failed", {
      jobId: "bull-job-2",
      payload,
      error: failure
    });
  });

  it("attempts redis cleanup even when worker close fails and rethrows the original close error", async () => {
    const workerCloseError = new Error("worker close failed");
    mocks.workerClose.mockRejectedValueOnce(workerCloseError);
    const consumer = createBullmqFactoryCredentialValidationConsumer({
      redisUrl: "redis://localhost:6379",
      concurrency: 1,
      processPayload: vi.fn().mockResolvedValue(undefined)
    });

    await expect(consumer.close()).rejects.toBe(workerCloseError);

    expect(mocks.workerClose).toHaveBeenCalledTimes(1);
    expect(mocks.redisQuit).toHaveBeenCalledTimes(1);
  });

  it("rejects malformed BullMQ payloads before claiming or processing them", async () => {
    const processPayload = vi.fn().mockResolvedValue(undefined);
    const onJobEvent = vi.fn();
    createBullmqFactoryCredentialValidationConsumer({
      redisUrl: "redis://localhost:6379",
      concurrency: 1,
      processPayload,
      onJobEvent
    });

    const processor = mocks.workerCtor.mock.results[0]?.value.__processor as (job: {
      id?: string;
      data: unknown;
    }) => Promise<unknown>;

    const invalidPayloads = [
      undefined,
      null,
      "credential_validation_3",
      42,
      {},
      { jobId: "" },
      { jobId: "   " },
      { jobId: 123 },
      { jobId: "credential_validation_3", extra: true }
    ];

    for (const payload of invalidPayloads) {
      await expect(
        processor({
          id: "bull-job-invalid",
          data: payload
        })
      ).rejects.toThrow("BullMQ factory credential validation job payload must be an object with exactly one non-empty string jobId");
    }

    expect(processPayload).not.toHaveBeenCalled();
    expect(onJobEvent).not.toHaveBeenCalled();
  });

  it("starts, waits until ready, closes, and forwards worker errors without extra wiring", async () => {
    const onError = vi.fn();
    const consumer = createBullmqFactoryCredentialValidationConsumer({
      redisUrl: "redis://localhost:6379",
      concurrency: 4,
      processPayload: vi.fn().mockResolvedValue(undefined),
      onError
    });

    expect(mocks.workerOn).toHaveBeenCalledTimes(2);
    expect(mocks.workerOn).toHaveBeenNthCalledWith(1, "error", expect.any(Function));
    expect(mocks.workerOn).toHaveBeenNthCalledWith(2, "failed", expect.any(Function));

    const runtimeErrorHandler = mocks.workerOn.mock.calls[0]?.[1] as (error: unknown) => void;
    const failedHandler = mocks.workerOn.mock.calls[1]?.[1] as (_job: unknown, error: unknown) => void;
    const runtimeError = new Error("redis dropped");
    const jobFailure = new Error("job failed");

    runtimeErrorHandler(runtimeError);
    failedHandler(null, jobFailure);

    expect(onError).toHaveBeenNthCalledWith(1, runtimeError);
    expect(onError).toHaveBeenNthCalledWith(2, jobFailure);

    await consumer.start();
    await consumer.start();
    await consumer.waitUntilReady();
    await consumer.close();

    expect(mocks.workerRun).toHaveBeenCalledTimes(1);
    expect(mocks.workerWaitUntilReady).toHaveBeenCalledTimes(1);
    expect(mocks.workerClose).toHaveBeenCalledTimes(1);
    expect(mocks.redisQuit).toHaveBeenCalledTimes(1);
    expect(mocks.redisCtor).toHaveBeenCalledWith("redis://localhost:6379", {
      maxRetriesPerRequest: null
    });
  });
});
