import { describe, expect, it, vi } from "vitest";

import { createQueueOutboxWorker } from "../src/workflows/queue-outbox-worker.js";

const outboxRecord = {
  id: "outbox-1",
  tenantId: "tenant-1",
  runId: "run-1",
  workflowTemplateId: "workflow-1",
  userId: "user-1",
  idempotencyKey: "tenant-1:workflow-1:run-1",
  attempts: 1,
  claimToken: "11111111-1111-4111-8111-111111111111"
};

describe("queue outbox worker", () => {
  it("claims pending outbox rows and marks them enqueued after queue success", async () => {
    const repository = {
      claimWorkflowQueueOutbox: vi.fn().mockResolvedValue([outboxRecord]),
      markWorkflowRunQueued: vi.fn().mockResolvedValue({ marked: true }),
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
      workflowTemplateId: "workflow-1",
      runId: "run-1",
      idempotencyKey: "tenant-1:workflow-1:run-1"
    });
    expect(repository.markWorkflowRunQueued).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      runId: "run-1",
      outboxId: "outbox-1",
      claimToken: "11111111-1111-4111-8111-111111111111"
    });
    expect(repository.releaseWorkflowQueueOutbox).not.toHaveBeenCalled();
  });

  it("marks already queued outbox rows without creating duplicate queue jobs", async () => {
    const repository = {
      claimWorkflowQueueOutbox: vi.fn().mockResolvedValue([outboxRecord]),
      markWorkflowRunQueued: vi.fn().mockResolvedValue({ marked: true }),
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
      workflowTemplateId: "workflow-1",
      runId: "run-1",
      idempotencyKey: "tenant-1:workflow-1:run-1"
    });
    expect(repository.markWorkflowRunQueued).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      runId: "run-1",
      outboxId: "outbox-1",
      claimToken: "11111111-1111-4111-8111-111111111111"
    });
  });

  it("releases claimed outbox rows for retry when enqueue fails", async () => {
    const repository = {
      claimWorkflowQueueOutbox: vi.fn().mockResolvedValue([outboxRecord]),
      markWorkflowRunQueued: vi.fn(),
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
  });

  it("releases claimed rows when the claim token no longer owns the outbox row", async () => {
    const repository = {
      claimWorkflowQueueOutbox: vi.fn().mockResolvedValue([outboxRecord]),
      markWorkflowRunQueued: vi.fn().mockResolvedValue({ marked: false }),
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
      error: "outbox_claim_lost",
      retryAfterSeconds: 30
    });
  });
});
