import type { QueueOutboxRecord } from "../db/acid-guard-repository.js";
import type { WorkflowRunEnqueuer } from "./acid-run-reservation.js";

export type QueueOutboxRepository = {
  claimWorkflowQueueOutbox(input: { limit: number; staleClaimSeconds?: number }): Promise<QueueOutboxRecord[]>;
  markWorkflowRunQueued(input: {
    tenantId: string;
    runId: string;
    outboxId: string;
    claimToken: string;
    idempotencyKey: string;
  }): Promise<{ marked: boolean }>;
  confirmWorkflowRunQueued(input: { tenantId: string; runId: string; outboxId: string; claimToken?: string }): Promise<{ confirmed: boolean }>;
  releaseWorkflowQueueOutbox(input: { outboxId: string; claimToken: string; error: string; retryAfterSeconds: number }): Promise<{ released: boolean }>;
};

export function createQueueOutboxWorker(options: { repository: QueueOutboxRepository; enqueuer: WorkflowRunEnqueuer; retryAfterSeconds?: number }) {
  const retryAfterSeconds = options.retryAfterSeconds ?? 60;
  const staleClaimSeconds = Math.max(retryAfterSeconds, 60);

  return {
    async drain(input: { limit: number }): Promise<{ claimed: number; enqueued: number; failed: number }> {
      const records = await options.repository.claimWorkflowQueueOutbox({ limit: input.limit, staleClaimSeconds });
      let enqueued = 0;
      let failed = 0;

      for (const record of records) {
        const queueInput = {
          tenantId: record.tenantId,
          userId: record.userId,
          workflowId: record.workflowId,
          workflowTemplateId: record.workflowTemplateId,
          workflowIdentityKind: record.workflowIdentityKind,
          workflowPackageId: record.workflowPackageId,
          runId: record.runId,
          idempotencyKey: record.idempotencyKey
        };
        try {
          if (record.claimSource === "stale_claim") {
            const reconciled = await options.repository.confirmWorkflowRunQueued({
              tenantId: record.tenantId,
              runId: record.runId,
              outboxId: record.id,
              claimToken: record.claimToken
            });
            if (reconciled.confirmed) {
              enqueued += 1;
              continue;
            }
          }

          const enqueueResult = await options.enqueuer.enqueueOnce(queueInput);
          const marked = await options.repository.markWorkflowRunQueued({
            tenantId: record.tenantId,
            runId: record.runId,
            outboxId: record.id,
            claimToken: record.claimToken,
            idempotencyKey: record.idempotencyKey
          });
          if (!marked.marked) {
            const confirmed = await options.repository.confirmWorkflowRunQueued({
              tenantId: record.tenantId,
              runId: record.runId,
              outboxId: record.id
            });
            if (!confirmed.confirmed) {
              throw new Error(enqueueResult === "already_queued" ? "outbox_enqueue_confirm_lost" : "outbox_claim_lost");
            }
          }
          enqueued += 1;
        } catch (error) {
          failed += 1;
          await options.repository.releaseWorkflowQueueOutbox({
            outboxId: record.id,
            claimToken: record.claimToken,
            error: error instanceof Error ? error.message : "enqueue_failed",
            retryAfterSeconds
          });
        }
      }

      return { claimed: records.length, enqueued, failed };
    }
  };
}
