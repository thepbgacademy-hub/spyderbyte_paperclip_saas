import { describe, expect, it, vi } from "vitest";

import { createAcidRunReservationService } from "../src/workflows/acid-run-reservation.js";

const input = {
  tenantId: "tenant-1",
  userId: "user-1",
  workflowId: "workflow-1",
  workflowTemplateId: "workflow-1",
  runId: "run-1",
  idempotencyKey: "tenant-1:workflow-1:run-1"
};

describe("ACID workflow run reservation service", () => {
  it("reserves workflow runs and leaves enqueueing to the outbox worker", async () => {
    const repository = {
      reserveWorkflowRun: vi.fn().mockResolvedValue({ reserved: true, runId: "run-1" }),
      markWorkflowRunQueued: vi.fn().mockResolvedValue({ marked: true })
    };
    const enqueuer = { enqueueOnce: vi.fn().mockResolvedValue("enqueued") };
    const service = createAcidRunReservationService({ repository, enqueuer });

    await expect(service.reserveAndEnqueue(input)).resolves.toEqual({ runId: "run-1", queued: true });

    expect(repository.reserveWorkflowRun).toHaveBeenCalledWith(input);
    expect(enqueuer.enqueueOnce).not.toHaveBeenCalled();
    expect(repository.markWorkflowRunQueued).not.toHaveBeenCalled();
  });

  it("fails closed and does not enqueue unauthorized runs", async () => {
    const repository = {
      reserveWorkflowRun: vi.fn().mockResolvedValue({ reserved: false, reason: "entitlement_denied" }),
      markWorkflowRunQueued: vi.fn()
    };
    const enqueuer = { enqueueOnce: vi.fn() };
    const service = createAcidRunReservationService({ repository, enqueuer });

    await expect(service.reserveAndEnqueue(input)).rejects.toMatchObject({
      code: "workflow_reservation_failed",
      publicMessage: "workflow_failed",
      reason: "entitlement_denied"
    });
    expect(enqueuer.enqueueOnce).not.toHaveBeenCalled();
  });

  it("leaves unqueued duplicate reservations to the outbox worker", async () => {
    const repository = {
      reserveWorkflowRun: vi.fn().mockResolvedValue({ reserved: false, reason: "duplicate" }),
      markWorkflowRunQueued: vi.fn().mockResolvedValue({ marked: true })
    };
    const enqueuer = { enqueueOnce: vi.fn().mockResolvedValue("enqueued") };
    const service = createAcidRunReservationService({ repository, enqueuer });

    await expect(service.reserveAndEnqueue(input)).rejects.toMatchObject({
      code: "workflow_reservation_failed",
      reason: "duplicate"
    });
    expect(enqueuer.enqueueOnce).not.toHaveBeenCalled();
    expect(repository.markWorkflowRunQueued).not.toHaveBeenCalled();
  });
});
