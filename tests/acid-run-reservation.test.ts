import { describe, expect, it, vi } from "vitest";

import { createAcidRunReservationService } from "../src/workflows/acid-run-reservation.js";

const input = {
  tenantId: "tenant-1",
  userId: "user-1",
  workflowTemplateId: "workflow-1",
  runId: "run-1",
  idempotencyKey: "tenant-1:workflow-1:run-1"
};

describe("ACID workflow run reservation service", () => {
  it("queues only after the database reservation succeeds", async () => {
    const repository = {
      reserveWorkflowRun: vi.fn().mockResolvedValue({ reserved: true, runId: "run-1" })
    };
    const enqueuer = { enqueue: vi.fn().mockResolvedValue(undefined) };
    const service = createAcidRunReservationService({ repository, enqueuer });

    await expect(service.reserveAndEnqueue(input)).resolves.toEqual({ runId: "run-1", queued: true });

    expect(repository.reserveWorkflowRun).toHaveBeenCalledWith(input);
    expect(enqueuer.enqueue).toHaveBeenCalledWith(input);
  });

  it("fails closed and does not enqueue duplicate or unauthorized runs", async () => {
    const repository = {
      reserveWorkflowRun: vi.fn().mockResolvedValue({ reserved: false, reason: "duplicate" })
    };
    const enqueuer = { enqueue: vi.fn() };
    const service = createAcidRunReservationService({ repository, enqueuer });

    await expect(service.reserveAndEnqueue(input)).rejects.toMatchObject({
      code: "workflow_reservation_failed",
      publicMessage: "workflow_failed",
      reason: "duplicate"
    });
    expect(enqueuer.enqueue).not.toHaveBeenCalled();
  });

  it("recovers an unqueued duplicate reservation before reporting duplicate", async () => {
    const repository = {
      reserveWorkflowRun: vi.fn().mockResolvedValue({ reserved: false, reason: "duplicate" })
    };
    const enqueuer = {
      hasQueued: vi.fn().mockResolvedValue(false),
      enqueue: vi.fn().mockResolvedValue(undefined)
    };
    const service = createAcidRunReservationService({ repository, enqueuer });

    await expect(service.reserveAndEnqueue(input)).resolves.toEqual({ runId: "run-1", queued: true });
    expect(enqueuer.hasQueued).toHaveBeenCalledWith(input);
    expect(enqueuer.enqueue).toHaveBeenCalledWith(input);
  });
});
