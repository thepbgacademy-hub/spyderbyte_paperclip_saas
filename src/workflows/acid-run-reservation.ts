import type { ReserveWorkflowRunInput, ReserveWorkflowRunResult } from "../db/acid-guard-repository.js";

export type WorkflowRunReservationRepository = {
  reserveWorkflowRun(input: ReserveWorkflowRunInput): Promise<ReserveWorkflowRunResult>;
  markWorkflowRunQueued?(input: { tenantId: string; runId: string }): Promise<{ marked: boolean }>;
};

export type WorkflowRunEnqueuer = {
  enqueueOnce(input: ReserveWorkflowRunInput): Promise<"enqueued" | "already_queued">;
};

export class WorkflowRunReservationError extends Error {
  readonly code = "workflow_reservation_failed";
  readonly publicMessage = "workflow_failed";

  constructor(readonly reason: Exclude<ReserveWorkflowRunResult, { reserved: true }>["reason"]) {
    super("Workflow run could not be reserved");
    this.name = "WorkflowRunReservationError";
  }
}

export function createAcidRunReservationService(options: { repository: WorkflowRunReservationRepository; enqueuer: WorkflowRunEnqueuer }) {
  return {
    async reserveAndEnqueue(input: ReserveWorkflowRunInput): Promise<{ runId: string; queued: true }> {
      const reservation = await options.repository.reserveWorkflowRun(input);
      if (!reservation.reserved) {
        throw new WorkflowRunReservationError(reservation.reason);
      }

      return { runId: reservation.runId, queued: true };
    }
  };
}
