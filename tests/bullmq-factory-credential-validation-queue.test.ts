import { afterEach, describe, expect, it, vi } from "vitest";

import type { CredentialValidationJob } from "../src/factory/domain/types.js";
import {
  createMemoryFactoryCredentialRepository,
  type FactoryCredentialRepository
} from "../src/factory/power-sources/factory-credential-repository.js";
import {
  createBullmqFactoryCredentialValidationJobId,
  createBullmqFactoryCredentialValidationQueue
} from "../src/factory/queues/bullmq-factory-credential-validation-queue.js";

const mocks = vi.hoisted(() => ({
  add: vi.fn(),
  getJob: vi.fn(),
  queueClose: vi.fn().mockResolvedValue(undefined),
  redisQuit: vi.fn().mockResolvedValue("OK"),
  queueCtor: vi.fn(),
  redisCtor: vi.fn()
}));

vi.mock("bullmq", () => ({
  Queue: mocks.queueCtor.mockImplementation(() => ({
    add: mocks.add,
    getJob: mocks.getJob,
    close: mocks.queueClose
  }))
}));

vi.mock("ioredis", () => ({
  Redis: mocks.redisCtor.mockImplementation(() => ({
    quit: mocks.redisQuit
  }))
}));

function queuedJob(overrides?: Partial<CredentialValidationJob>): CredentialValidationJob {
  return {
    id: "credential_validation_1",
    workspaceId: "workspace_1",
    credentialId: "credential_1",
    reason: "credential_created",
    status: "queued",
    requestedAt: "2026-07-15T12:00:00.000Z",
    startedAt: null,
    completedAt: null,
    message: null,
    ...overrides
  };
}

function createRepositorySpy() {
  const repository = createMemoryFactoryCredentialRepository();

  return {
    repository: {
      insertCredential: repository.insertCredential,
      removeCredential: repository.removeCredential,
      getCredential: repository.getCredential,
      listCredentials: repository.listCredentials,
      listAllCredentials: repository.listAllCredentials,
      updateCredential: repository.updateCredential,
      insertAccessAuditEvent: repository.insertAccessAuditEvent,
      insertValidationJob: vi.fn(repository.insertValidationJob),
      insertValidationJobIfOpenAbsent: vi.fn(repository.insertValidationJobIfOpenAbsent),
      removeValidationJob: vi.fn(repository.removeValidationJob),
      claimNextQueuedValidationJob: vi.fn(repository.claimNextQueuedValidationJob),
      claimQueuedValidationJobById: vi.fn(repository.claimQueuedValidationJobById),
      hasOpenValidationJob: vi.fn(repository.hasOpenValidationJob),
      updateValidationJob: vi.fn(repository.updateValidationJob)
    } satisfies FactoryCredentialRepository,
    state: repository
  };
}

afterEach(() => {
  vi.clearAllMocks();
  mocks.getJob.mockReset();
  mocks.getJob.mockResolvedValue({ id: "transport-job-observed" });
});

describe("bullmq factory credential validation queue", () => {
  it("uses the isolated Wealth Factory queue namespace by default and rejects legacy namespaces", () => {
    const { repository } = createRepositorySpy();

    const queue = createBullmqFactoryCredentialValidationQueue({
      repository,
      redisUrl: "redis://localhost:6379"
    });

    expect(queue.config).toEqual({
      queueName: "wealth-factory-validations-v1",
      prefix: "wealth-factory-blueprint-v1"
    });

    expect(() =>
      createBullmqFactoryCredentialValidationQueue({
        repository,
        redisUrl: "redis://localhost:6379",
        config: {
          queueName: "wfpc-workflow-runs",
          prefix: "wealth-factory-blueprint-v1"
        }
      })
    ).toThrow("Factory queue name must not reuse a legacy queue namespace");
  });

  it("persists repository state before publishing a BullMQ job with a deterministic job id", async () => {
    const { repository, state } = createRepositorySpy();
    mocks.add.mockResolvedValue({ id: "job-1" });
    const job = queuedJob();

    const queue = createBullmqFactoryCredentialValidationQueue({
      repository,
      redisUrl: "redis://localhost:6379"
    });

    await queue.enqueue(job);

    expect(repository.insertValidationJobIfOpenAbsent).toHaveBeenCalledWith(job);
    expect(mocks.add).toHaveBeenCalledWith(
      "factory-credential-validation",
      { jobId: job.id },
      { jobId: createBullmqFactoryCredentialValidationJobId(job.id) }
    );
    expect(state.dumpValidationJobs()).toEqual([job]);
    expect(mocks.queueCtor).toHaveBeenCalledWith(
      "wealth-factory-validations-v1",
      expect.objectContaining({
        prefix: "wealth-factory-blueprint-v1"
      })
    );
  });

  it("rolls back repository state when BullMQ publishing fails", async () => {
    const { repository, state } = createRepositorySpy();
    mocks.add.mockRejectedValue(new Error("redis unavailable"));
    const job = queuedJob();
    const queue = createBullmqFactoryCredentialValidationQueue({
      repository,
      redisUrl: "redis://localhost:6379"
    });

    await expect(queue.enqueue(job)).rejects.toThrow("redis unavailable");

    expect(repository.removeValidationJob).toHaveBeenCalledWith(job.id);
    expect(state.dumpValidationJobs()).toEqual([]);
  });

  it("does not delete repository state when publish succeeds before transport lookup is observable", async () => {
    const { repository, state } = createRepositorySpy();
    mocks.add.mockResolvedValue({ id: "job-1" });
    mocks.getJob.mockResolvedValueOnce(null);
    const job = queuedJob();
    const queue = createBullmqFactoryCredentialValidationQueue({
      repository,
      redisUrl: "redis://localhost:6379"
    });

    await expect(queue.enqueue(job)).resolves.toBeUndefined();

    expect(repository.removeValidationJob).not.toHaveBeenCalled();
    expect(state.dumpValidationJobs()).toEqual([job]);
  });

  it("verifies duplicate transport errors before retaining repository state", async () => {
    const { repository, state } = createRepositorySpy();
    mocks.add.mockRejectedValue(new Error("job already exists"));
    mocks.getJob.mockResolvedValueOnce(null);
    const job = queuedJob();
    const queue = createBullmqFactoryCredentialValidationQueue({
      repository,
      redisUrl: "redis://localhost:6379"
    });

    await expect(queue.enqueue(job)).rejects.toThrow("BullMQ credential validation job was not observable");

    expect(repository.removeValidationJob).toHaveBeenCalledWith(job.id);
    expect(state.dumpValidationJobs()).toEqual([]);
  });

  it("retains repository state when a duplicate transport error points to an observable job", async () => {
    const { repository, state } = createRepositorySpy();
    mocks.add.mockRejectedValue(new Error("job already exists"));
    mocks.getJob.mockResolvedValueOnce({ id: "transport-job-observed" });
    const job = queuedJob();
    const queue = createBullmqFactoryCredentialValidationQueue({
      repository,
      redisUrl: "redis://localhost:6379"
    });

    await expect(queue.enqueue(job)).resolves.toBeUndefined();

    expect(repository.removeValidationJob).not.toHaveBeenCalled();
    expect(state.dumpValidationJobs()).toEqual([job]);
  });

  it("treats duplicate enqueue as idempotent without creating a second repository or transport record", async () => {
    const { repository, state } = createRepositorySpy();
    mocks.add.mockResolvedValue({ id: "job-1" });
    const job = queuedJob();

    const queue = createBullmqFactoryCredentialValidationQueue({
      repository,
      redisUrl: "redis://localhost:6379"
    });

    await queue.enqueue(job);
    await queue.enqueue(job);

    expect(repository.insertValidationJobIfOpenAbsent).toHaveBeenCalledTimes(2);
    expect(mocks.add).toHaveBeenCalledTimes(1);
    expect(state.dumpValidationJobs()).toEqual([job]);
  });

  it("suppresses concurrent duplicate enqueue attempts at the repository boundary", async () => {
    const { repository, state } = createRepositorySpy();
    mocks.add.mockResolvedValue({ id: "job-1" });
    const queue = createBullmqFactoryCredentialValidationQueue({
      repository,
      redisUrl: "redis://localhost:6379"
    });

    await Promise.all([
      queue.enqueue(queuedJob({ id: "credential_validation_1" })),
      queue.enqueue(queuedJob({ id: "credential_validation_2" }))
    ]);

    expect(repository.insertValidationJobIfOpenAbsent).toHaveBeenCalledTimes(2);
    expect(mocks.add).toHaveBeenCalledTimes(1);
    expect(state.dumpValidationJobs()).toHaveLength(1);
  });

  it("delegates claimNext, claimById, complete, requeue, and hasOpenJob to the repository as the authoritative state holder", async () => {
    const { repository, state } = createRepositorySpy();
    mocks.add.mockResolvedValue({ id: "job-1" });
    const queue = createBullmqFactoryCredentialValidationQueue({
      repository,
      redisUrl: "redis://localhost:6379"
    });
    await queue.enqueue(queuedJob());

    const claimed = await queue.claimNext({ now: "2026-07-15T12:01:00.000Z" });
    const claimedById = await queue.claimById({
      jobId: "credential_validation_1",
      now: "2026-07-15T12:01:01.000Z"
    });
    await queue.complete(claimed!, {
      status: "succeeded",
      completedAt: "2026-07-15T12:02:00.000Z",
      message: "Power Source is connected."
    });
    await queue.requeue(claimed!, {
      requestedAt: "2026-07-15T12:03:00.000Z",
      message: "Validation could not complete; it can retry later."
    });
    const hasOpenJob = await queue.hasOpenJob({
      workspaceId: "workspace_1",
      credentialId: "credential_1",
      reason: "credential_created"
    });

    expect(repository.claimNextQueuedValidationJob).toHaveBeenCalledWith({
      startedAt: "2026-07-15T12:01:00.000Z"
    });
    expect(repository.claimQueuedValidationJobById).toHaveBeenCalledWith({
      jobId: "credential_validation_1",
      startedAt: "2026-07-15T12:01:01.000Z"
    });
    expect(claimedById).toBeNull();
    expect(repository.updateValidationJob).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        id: "credential_validation_1",
        status: "succeeded",
        completedAt: "2026-07-15T12:02:00.000Z",
        message: "Power Source is connected."
      })
    );
    expect(repository.updateValidationJob).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        id: "credential_validation_1",
        status: "queued",
        requestedAt: "2026-07-15T12:03:00.000Z",
        startedAt: null,
        completedAt: null,
        message: "Validation could not complete; it can retry later."
      })
    );
    expect(hasOpenJob).toBe(true);
    expect(state.dumpValidationJobs()).toEqual([
      expect.objectContaining({
        id: "credential_validation_1",
        status: "queued"
      })
    ]);
    expect(mocks.getJob).not.toHaveBeenCalled();
  });

  it("closes BullMQ and Redis resources", async () => {
    const { repository } = createRepositorySpy();
    const queue = createBullmqFactoryCredentialValidationQueue({
      repository,
      redisUrl: "redis://localhost:6379"
    });

    await queue.close();

    expect(mocks.queueClose).toHaveBeenCalledOnce();
    expect(mocks.redisQuit).toHaveBeenCalledOnce();
  });

  it("attempts Redis cleanup when BullMQ queue close fails", async () => {
    const { repository } = createRepositorySpy();
    mocks.queueClose.mockRejectedValueOnce(new Error("queue close failed"));
    const queue = createBullmqFactoryCredentialValidationQueue({
      repository,
      redisUrl: "redis://localhost:6379"
    });

    await expect(queue.close()).rejects.toThrow("queue close failed");
    expect(mocks.redisQuit).toHaveBeenCalledOnce();
  });
});
