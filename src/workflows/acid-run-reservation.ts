import type { ReserveWorkflowRunInput, ReserveWorkflowRunResult } from "../db/acid-guard-repository.js";

export type WorkflowRunReservationRepository = {
  reserveWorkflowRun(input: ReserveWorkflowRunInput): Promise<ReserveWorkflowRunResult>;
};

export type WorkflowRunEnqueuer = {
  enqueue(input: ReserveWorkflowRunInput): Promise<void>;
  hasQueued?(input: ReserveWorkflowRunInput): Promise<boolean>;
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
        if (reservation.reason === "duplicate" && options.enqueuer.hasQueued && !(await options.enqueuer.hasQueued(input))) {
          await options.enqueuer.enqueue(input);
          return { runId: input.runId, queued: true };
        }

        throw new WorkflowRunReservationError(reservation.reason);
      }

      await options.enqueuer.enqueue(input);
      return { runId: reservation.runId, queued: true };
    }
  };
}
