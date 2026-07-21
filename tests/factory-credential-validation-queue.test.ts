import { describe, expect, it } from "vitest";

import type { CredentialValidationJob } from "../src/factory/domain/types.js";
import { createMemoryFactoryCredentialRepository } from "../src/factory/power-sources/factory-credential-repository.js";
import { createRepositoryBackedFactoryCredentialValidationQueue } from "../src/factory/queues/factory-credential-validation-queue.js";

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

describe("factory credential validation queue", () => {
  it("uses the isolated Wealth Factory queue namespace by default", () => {
    const repository = createMemoryFactoryCredentialRepository();
    const queue = createRepositoryBackedFactoryCredentialValidationQueue({ repository });

    expect(queue.config).toEqual({
      queueName: "wealth-factory-validations-v1",
      prefix: "wealth-factory-blueprint-v1"
    });
  });

  it("rejects legacy Paperclip queue names before jobs can be enqueued", async () => {
    const repository = createMemoryFactoryCredentialRepository();

    expect(() =>
      createRepositoryBackedFactoryCredentialValidationQueue({
        repository,
        config: { queueName: "wfpc-workflow-runs", prefix: "wealth-factory-blueprint-v1" }
      })
    ).toThrow("Factory queue name must not reuse a legacy queue namespace");
  });

  it("enqueues, claims, completes, and preserves tenant-safe validation jobs", async () => {
    const repository = createMemoryFactoryCredentialRepository();
    const queue = createRepositoryBackedFactoryCredentialValidationQueue({ repository });

    await queue.enqueue(queuedJob());
    const claimed = await queue.claimNext({ now: "2026-07-15T12:01:00.000Z" });
    await queue.complete(claimed!, {
      status: "succeeded",
      completedAt: "2026-07-15T12:02:00.000Z",
      message: "Power Source is connected."
    });

    expect(claimed).toMatchObject({
      id: "credential_validation_1",
      status: "processing",
      startedAt: "2026-07-15T12:01:00.000Z"
    });
    expect(repository.dumpValidationJobs()).toEqual([
      expect.objectContaining({
        id: "credential_validation_1",
        workspaceId: "workspace_1",
        credentialId: "credential_1",
        status: "succeeded",
        startedAt: "2026-07-15T12:01:00.000Z",
        completedAt: "2026-07-15T12:02:00.000Z",
        message: "Power Source is connected."
      })
    ]);
  });

  it("allows only one claimant to take a queued validation job", async () => {
    const repository = createMemoryFactoryCredentialRepository();
    const queue = createRepositoryBackedFactoryCredentialValidationQueue({ repository });
    await queue.enqueue(queuedJob());

    const [firstClaim, secondClaim] = await Promise.all([
      queue.claimNext({ now: "2026-07-15T12:01:00.000Z" }),
      queue.claimNext({ now: "2026-07-15T12:01:01.000Z" })
    ]);

    expect([firstClaim, secondClaim].filter(Boolean)).toHaveLength(1);
    expect(repository.dumpValidationJobs()).toEqual([
      expect.objectContaining({
        id: "credential_validation_1",
        status: "processing"
      })
    ]);
  });

  it("claims only the requested queued validation job by id", async () => {
    const repository = createMemoryFactoryCredentialRepository();
    const queue = createRepositoryBackedFactoryCredentialValidationQueue({ repository });
    await queue.enqueue(queuedJob({ id: "credential_validation_1" }));
    await queue.enqueue(queuedJob({ id: "credential_validation_2", credentialId: "credential_2" }));

    const claimed = await queue.claimById({
      jobId: "credential_validation_2",
      now: "2026-07-15T12:01:00.000Z"
    });

    expect(claimed).toMatchObject({
      id: "credential_validation_2",
      credentialId: "credential_2",
      status: "processing",
      startedAt: "2026-07-15T12:01:00.000Z"
    });
    expect(repository.dumpValidationJobs()).toEqual([
      expect.objectContaining({
        id: "credential_validation_1",
        status: "queued",
        startedAt: null
      }),
      expect.objectContaining({
        id: "credential_validation_2",
        status: "processing",
        startedAt: "2026-07-15T12:01:00.000Z"
      })
    ]);
  });

  it("returns null when exact claim targets a missing or nonqueued validation job", async () => {
    const repository = createMemoryFactoryCredentialRepository();
    const queue = createRepositoryBackedFactoryCredentialValidationQueue({ repository });
    await queue.enqueue(queuedJob({ id: "credential_validation_queued" }));
    await repository.insertValidationJob(
      queuedJob({
        id: "credential_validation_processing",
        status: "processing",
        startedAt: "2026-07-15T12:01:00.000Z"
      })
    );
    await repository.insertValidationJob(
      queuedJob({
        id: "credential_validation_succeeded",
        status: "succeeded",
        startedAt: "2026-07-15T12:01:00.000Z",
        completedAt: "2026-07-15T12:02:00.000Z",
        message: "done"
      })
    );

    await expect(
      queue.claimById({ jobId: "credential_validation_missing", now: "2026-07-15T12:03:00.000Z" })
    ).resolves.toBeNull();
    await expect(
      queue.claimById({ jobId: "credential_validation_processing", now: "2026-07-15T12:03:00.000Z" })
    ).resolves.toBeNull();
    await expect(
      queue.claimById({ jobId: "credential_validation_succeeded", now: "2026-07-15T12:03:00.000Z" })
    ).resolves.toBeNull();

    expect(repository.dumpValidationJobs()).toEqual([
      expect.objectContaining({
        id: "credential_validation_queued",
        status: "queued"
      }),
      expect.objectContaining({
        id: "credential_validation_processing",
        status: "processing"
      }),
      expect.objectContaining({
        id: "credential_validation_succeeded",
        status: "succeeded"
      })
    ]);
  });

  it("requeues a claimed job without losing its tenant-safe identity", async () => {
    const repository = createMemoryFactoryCredentialRepository();
    const queue = createRepositoryBackedFactoryCredentialValidationQueue({ repository });
    await queue.enqueue(queuedJob());
    const claimed = await queue.claimNext({ now: "2026-07-15T12:01:00.000Z" });

    await queue.requeue(claimed!, {
      requestedAt: "2026-07-15T12:03:00.000Z",
      message: "Validation could not complete; it can retry later."
    });

    expect(repository.dumpValidationJobs()).toEqual([
      expect.objectContaining({
        id: "credential_validation_1",
        workspaceId: "workspace_1",
        credentialId: "credential_1",
        status: "queued",
        requestedAt: "2026-07-15T12:03:00.000Z",
        startedAt: null,
        completedAt: null,
        message: "Validation could not complete; it can retry later."
      })
    ]);
  });

  it("detects open queued or processing jobs for duplicate suppression", async () => {
    const repository = createMemoryFactoryCredentialRepository();
    const queue = createRepositoryBackedFactoryCredentialValidationQueue({ repository });

    await queue.enqueue(queuedJob({ id: "credential_validation_queued", reason: "weekly_revalidation" }));

    await expect(
      queue.hasOpenJob({
        workspaceId: "workspace_1",
        credentialId: "credential_1",
        reason: "weekly_revalidation"
      })
    ).resolves.toBe(true);
    await expect(
      queue.hasOpenJob({
        workspaceId: "workspace_1",
        credentialId: "credential_1",
        reason: "credential_created"
      })
    ).resolves.toBe(false);
  });
});
