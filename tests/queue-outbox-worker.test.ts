import { describe, expect, it, vi } from "vitest";

import { createQueueOutboxWorker } from "../src/workflows/queue-outbox-worker.js";

const outboxRecord = {
  id: "outbox-1",
  tenantId: "tenant-1",
  runId: "run-1",
  workflowId: "workflow-1",
  workflowTemplateId: "workflow-1",
  workflowIdentityKind: "tenant_template" as const,
  workflowPackageId: "package-1",
  userId: "user-1",
  idempotencyKey: "tenant-1:workflow-1:run-1",
  attempts: 1,
  claimToken: "11111111-1111-4111-8111-111111111111",
  claimSource: "pending_retry" as const
};

describe("queue outbox worker", () => {
  it("claims pending outbox rows and marks them enqueued after queue success", async () => {
    const repository = {
      claimWorkflowQueueOutbox: vi.fn().mockResolvedValue([outboxRecord]),
      markWorkflowRunQueued: vi.fn().mockResolvedValue({ marked: true }),
      confirmWorkflowRunQueued: vi.fn(),
      releaseWorkflowQueueOutbox: vi.fn()
    };
    const enqueuer = {
      enqueueOnce: vi.fn().mockResolvedValue("enqueued")
    };
    const worker = createQueueOutboxWorker({ repository, enqueuer });

    await expect(worker.drain({ limit: 5 })).resolves.toEqual({ claimed: 1, enqueued: 1, failed: 0 });
    expect(repository.claimWorkflowQueueOutbox).toHaveBeenCalledWith({ limit: 5, staleClaimSeconds: 60 });

    expect(enqueuer.enqueueOnce).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      userId: "user-1",
      workflowId: "workflow-1",
      workflowTemplateId: "workflow-1",
      workflowIdentityKind: "tenant_template",
      workflowPackageId: "package-1",
      runId: "run-1",
      idempotencyKey: "tenant-1:workflow-1:run-1"
    });
    expect(repository.markWorkflowRunQueued).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      runId: "run-1",
      outboxId: "outbox-1",
      claimToken: "11111111-1111-4111-8111-111111111111",
      idempotencyKey: "tenant-1:workflow-1:run-1"
    });
    expect(repository.releaseWorkflowQueueOutbox).not.toHaveBeenCalled();
    expect(repository.confirmWorkflowRunQueued).not.toHaveBeenCalled();
  });

  it("marks already queued outbox rows without creating duplicate queue jobs", async () => {
    const repository = {
      claimWorkflowQueueOutbox: vi.fn().mockResolvedValue([outboxRecord]),
      markWorkflowRunQueued: vi.fn().mockResolvedValue({ marked: true }),
      confirmWorkflowRunQueued: vi.fn(),
      releaseWorkflowQueueOutbox: vi.fn()
    };
    const enqueuer = {
      enqueueOnce: vi.fn().mockResolvedValue("already_queued")
    };
    const worker = createQueueOutboxWorker({ repository, enqueuer });

    await expect(worker.drain({ limit: 5 })).resolves.toEqual({ claimed: 1, enqueued: 1, failed: 0 });
    expect(enqueuer.enqueueOnce).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      userId: "user-1",
      workflowId: "workflow-1",
      workflowTemplateId: "workflow-1",
      workflowIdentityKind: "tenant_template",
      workflowPackageId: "package-1",
      runId: "run-1",
      idempotencyKey: "tenant-1:workflow-1:run-1"
    });
    expect(repository.markWorkflowRunQueued).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      runId: "run-1",
      outboxId: "outbox-1",
      claimToken: "11111111-1111-4111-8111-111111111111",
      idempotencyKey: "tenant-1:workflow-1:run-1"
    });
    expect(repository.confirmWorkflowRunQueued).not.toHaveBeenCalled();
  });

  it("seals reclaimed stale claims without re-enqueueing when the repository proves the run already advanced", async () => {
    const repository = {
      claimWorkflowQueueOutbox: vi.fn().mockResolvedValue([{ ...outboxRecord, claimSource: "stale_claim" as const }]),
      markWorkflowRunQueued: vi.fn(),
      confirmWorkflowRunQueued: vi.fn().mockResolvedValue({ confirmed: true }),
      releaseWorkflowQueueOutbox: vi.fn()
    };
    const enqueuer = {
      enqueueOnce: vi.fn()
    };
    const worker = createQueueOutboxWorker({ repository, enqueuer });

    await expect(worker.drain({ limit: 5 })).resolves.toEqual({ claimed: 1, enqueued: 1, failed: 0 });
    expect(repository.confirmWorkflowRunQueued).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      runId: "run-1",
      outboxId: "outbox-1",
      claimToken: "11111111-1111-4111-8111-111111111111"
    });
    expect(enqueuer.enqueueOnce).not.toHaveBeenCalled();
    expect(repository.markWorkflowRunQueued).not.toHaveBeenCalled();
    expect(repository.releaseWorkflowQueueOutbox).not.toHaveBeenCalled();
  });

  it("re-enqueues reclaimed stale claims only when the repository cannot prove the run already advanced", async () => {
    const repository = {
      claimWorkflowQueueOutbox: vi.fn().mockResolvedValue([{ ...outboxRecord, claimSource: "stale_claim" as const }]),
      markWorkflowRunQueued: vi.fn().mockResolvedValue({ marked: true }),
      confirmWorkflowRunQueued: vi.fn().mockResolvedValue({ confirmed: false }),
      releaseWorkflowQueueOutbox: vi.fn()
    };
    const enqueuer = {
      enqueueOnce: vi.fn().mockResolvedValue("enqueued")
    };
    const worker = createQueueOutboxWorker({ repository, enqueuer });

    await expect(worker.drain({ limit: 5 })).resolves.toEqual({ claimed: 1, enqueued: 1, failed: 0 });
    expect(repository.confirmWorkflowRunQueued).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      runId: "run-1",
      outboxId: "outbox-1",
      claimToken: "11111111-1111-4111-8111-111111111111"
    });
    expect(enqueuer.enqueueOnce).toHaveBeenCalledOnce();
    expect(repository.markWorkflowRunQueued).toHaveBeenCalledOnce();
  });

  it("releases claimed outbox rows for retry when enqueue fails", async () => {
    const repository = {
      claimWorkflowQueueOutbox: vi.fn().mockResolvedValue([outboxRecord]),
      markWorkflowRunQueued: vi.fn(),
      confirmWorkflowRunQueued: vi.fn(),
      releaseWorkflowQueueOutbox: vi.fn().mockResolvedValue({ released: true })
    };
    const worker = createQueueOutboxWorker({
      repository,
      enqueuer: { enqueueOnce: vi.fn().mockRejectedValue(new Error("redis unavailable")) },
      retryAfterSeconds: 30
    });

    await expect(worker.drain({ limit: 5 })).resolves.toEqual({ claimed: 1, enqueued: 0, failed: 1 });
    expect(repository.claimWorkflowQueueOutbox).toHaveBeenCalledWith({ limit: 5, staleClaimSeconds: 60 });

    expect(repository.releaseWorkflowQueueOutbox).toHaveBeenCalledWith({
      outboxId: "outbox-1",
      claimToken: "11111111-1111-4111-8111-111111111111",
      error: "redis unavailable",
      retryAfterSeconds: 30
    });
    expect(repository.markWorkflowRunQueued).not.toHaveBeenCalled();
    expect(repository.confirmWorkflowRunQueued).not.toHaveBeenCalled();
  });

  it("accepts repository-backed durable reconciliation instead of releasing a freshly enqueued row when the mark step loses the claim", async () => {
    const repository = {
      claimWorkflowQueueOutbox: vi.fn().mockResolvedValue([outboxRecord]),
      markWorkflowRunQueued: vi.fn().mockResolvedValue({ marked: false }),
      confirmWorkflowRunQueued: vi.fn().mockResolvedValue({ confirmed: true }),
      releaseWorkflowQueueOutbox: vi.fn().mockResolvedValue({ released: true })
    };
    const worker = createQueueOutboxWorker({
      repository,
      enqueuer: { enqueueOnce: vi.fn().mockResolvedValue("enqueued") },
      retryAfterSeconds: 30
    });

    await expect(worker.drain({ limit: 5 })).resolves.toEqual({ claimed: 1, enqueued: 1, failed: 0 });
    expect(repository.confirmWorkflowRunQueued).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      runId: "run-1",
      outboxId: "outbox-1"
    });
    expect(repository.releaseWorkflowQueueOutbox).not.toHaveBeenCalled();
  });

  it("confirms already-queued rows instead of releasing them when BullMQ reports the job was already queued", async () => {
    const repository = {
      claimWorkflowQueueOutbox: vi.fn().mockResolvedValue([outboxRecord]),
      markWorkflowRunQueued: vi.fn().mockResolvedValue({ marked: false }),
      confirmWorkflowRunQueued: vi.fn().mockResolvedValue({ confirmed: true }),
      releaseWorkflowQueueOutbox: vi.fn().mockResolvedValue({ released: true })
    };
    const worker = createQueueOutboxWorker({
      repository,
      enqueuer: { enqueueOnce: vi.fn().mockResolvedValue("already_queued") },
      retryAfterSeconds: 30
    });

    await expect(worker.drain({ limit: 5 })).resolves.toEqual({ claimed: 1, enqueued: 1, failed: 0 });
    expect(repository.confirmWorkflowRunQueued).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      runId: "run-1",
      outboxId: "outbox-1"
    });
    expect(repository.releaseWorkflowQueueOutbox).not.toHaveBeenCalled();
  });

  it("releases freshly enqueued rows for retry when durable confirmation is still missing after the mark step loses the claim", async () => {
    const repository = {
      claimWorkflowQueueOutbox: vi.fn().mockResolvedValue([outboxRecord]),
      markWorkflowRunQueued: vi.fn().mockResolvedValue({ marked: false }),
      confirmWorkflowRunQueued: vi.fn().mockResolvedValue({ confirmed: false }),
      releaseWorkflowQueueOutbox: vi.fn().mockResolvedValue({ released: true })
    };
    const worker = createQueueOutboxWorker({
      repository,
      enqueuer: { enqueueOnce: vi.fn().mockResolvedValue("enqueued") },
      retryAfterSeconds: 30
    });

    await expect(worker.drain({ limit: 5 })).resolves.toEqual({ claimed: 1, enqueued: 0, failed: 1 });
    expect(repository.releaseWorkflowQueueOutbox).toHaveBeenCalledWith({
      outboxId: "outbox-1",
      claimToken: "11111111-1111-4111-8111-111111111111",
      error: "outbox_claim_lost",
      retryAfterSeconds: 30
    });
  });

  it("releases claimed rows when the claim token no longer owns the outbox row and reconciliation cannot confirm an already queued job", async () => {
    const repository = {
      claimWorkflowQueueOutbox: vi.fn().mockResolvedValue([outboxRecord]),
      markWorkflowRunQueued: vi.fn().mockResolvedValue({ marked: false }),
      confirmWorkflowRunQueued: vi.fn().mockResolvedValue({ confirmed: false }),
      releaseWorkflowQueueOutbox: vi.fn().mockResolvedValue({ released: true })
    };
    const worker = createQueueOutboxWorker({
      repository,
      enqueuer: { enqueueOnce: vi.fn().mockResolvedValue("already_queued") },
      retryAfterSeconds: 30
    });

    await expect(worker.drain({ limit: 5 })).resolves.toEqual({ claimed: 1, enqueued: 0, failed: 1 });
    expect(repository.releaseWorkflowQueueOutbox).toHaveBeenCalledWith({
      outboxId: "outbox-1",
      claimToken: "11111111-1111-4111-8111-111111111111",
      error: "outbox_enqueue_confirm_lost",
      retryAfterSeconds: 30
    });
  });

});
