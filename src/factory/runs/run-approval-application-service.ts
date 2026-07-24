import type { Approval } from "../domain/types.js";
import {
  approvePendingApproval,
  requestChangesForPendingApproval
} from "../approvals/approval-service.js";
import type { FactoryRunApprovalRepository, FactoryRunApprovalRow } from "./run-approval-repository.js";

export type FactoryRunApprovalDecision = "approve" | "request_changes";
export type FactoryRunOutcome = "ready_for_export" | "awaiting_revision";

export class FactoryRunApprovalNotFoundError extends Error {
  constructor(runId: string) {
    super(`Run "${runId}" has no pending approval`);
    this.name = "FactoryRunApprovalNotFoundError";
  }
}

export class FactoryRunApprovalRevisionCapReachedError extends Error {
  constructor(runId: string) {
    super(`Run "${runId}" has already used its one allowed positioning revision; only approval is possible`);
    this.name = "FactoryRunApprovalRevisionCapReachedError";
  }
}

export class FactoryRunApprovalConflictError extends Error {
  constructor(runId: string) {
    super(`Run "${runId}" approval was already decided by a concurrent request`);
    this.name = "FactoryRunApprovalConflictError";
  }
}

function rowToApproval(row: FactoryRunApprovalRow): Approval {
  return {
    id: row.approvalId,
    workspaceId: row.tenantId,
    runId: row.runId,
    packageId: row.packageId,
    packageVersionId: row.packageVersionId,
    packageInstallId: row.packageInstallId,
    stationKey: row.stationKey,
    deliverableId: row.deliverableId,
    status: row.status,
    requestedAt: row.requestedAt,
    resolvedAt: row.resolvedAt,
    resolutionSummary: row.resolutionSummary
  };
}

/**
 * Decides a tenant's pending positioning approval, reusing the pure
 * approve/request-changes transitions from approval-service.ts (TASK-076:
 * do not reimplement that logic). The one-revision cap (intake-run-service.ts's
 * positioningRevisionGeneration 0|1) is enforced here by contract_key, since
 * there is no separate factory run table to reconstruct: only the "original"
 * contract may request changes -- a "revision_1" approval may only be approved.
 */
export async function decideFactoryRunApproval(input: {
  tenantId: string;
  runId: string;
  decision: FactoryRunApprovalDecision;
  resolutionSummary?: string;
  decidedAt: string;
  repository: FactoryRunApprovalRepository;
}): Promise<{ approval: FactoryRunApprovalRow; runOutcome: FactoryRunOutcome }> {
  const pendingRow = await input.repository.findPendingApprovalForRun({
    tenantId: input.tenantId,
    runId: input.runId
  });
  if (!pendingRow) {
    throw new FactoryRunApprovalNotFoundError(input.runId);
  }

  const approval = rowToApproval(pendingRow);

  if (input.decision === "approve") {
    approvePendingApproval({ approval, resolvedAt: input.decidedAt });
    const updated = await input.repository.applyDecision({
      tenantId: input.tenantId,
      approvalId: pendingRow.approvalId,
      status: "approved",
      resolvedAt: input.decidedAt,
      resolutionSummary: null
    });
    if (!updated) {
      throw new FactoryRunApprovalConflictError(input.runId);
    }
    return { approval: updated, runOutcome: "ready_for_export" };
  }

  if (pendingRow.contractKey !== "original") {
    throw new FactoryRunApprovalRevisionCapReachedError(input.runId);
  }

  const resolutionSummary = requestChangesForPendingApproval({
    approval,
    resolvedAt: input.decidedAt,
    resolutionSummary: input.resolutionSummary ?? ""
  }).resolutionSummary;

  const updated = await input.repository.applyDecision({
    tenantId: input.tenantId,
    approvalId: pendingRow.approvalId,
    status: "changes_requested",
    resolvedAt: input.decidedAt,
    resolutionSummary
  });
  if (!updated) {
    throw new FactoryRunApprovalConflictError(input.runId);
  }
  return { approval: updated, runOutcome: "awaiting_revision" };
}
