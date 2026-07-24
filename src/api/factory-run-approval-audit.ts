import { createDurableAuditSink } from "../audit/durable-audit.js";
import type { QueryClient } from "../db/supabase-repositories.js";
import type { FactoryRunApprovalDecision } from "../factory/runs/run-approval-application-service.js";

export type FactoryRunApprovalAuditSink = (event: {
  tenantId: string;
  actorUserId: string;
  runId: string;
  approvalId: string;
  decision: FactoryRunApprovalDecision;
}) => Promise<void>;

/**
 * Composes the durable audit sink (src/audit/durable-audit.ts) into the run
 * approval path's narrower audit event shape, mirroring
 * factory-package-install-audit.ts's install audit sink.
 */
export function createDurableFactoryRunApprovalAuditSink(client: QueryClient): FactoryRunApprovalAuditSink {
  const recordAuditEvent = createDurableAuditSink(client);
  return async function recordFactoryRunApprovalAuditEvent(event) {
    await recordAuditEvent({
      tenantId: event.tenantId,
      actorUserId: event.actorUserId,
      eventType:
        event.decision === "approve" ? "factory.run.approval_approved" : "factory.run.approval_changes_requested",
      entityType: "factory_run_approval",
      entityId: event.approvalId,
      metadata: { runId: event.runId }
    });
  };
}
