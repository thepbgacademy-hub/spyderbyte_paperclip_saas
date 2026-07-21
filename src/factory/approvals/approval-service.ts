import type { Approval } from "../domain/types.js";

export function createApprovalRequest(input: {
  id: string;
  workspaceId: string;
  runId: string;
  packageId: string;
  packageVersionId: string;
  packageInstallId: string;
  stationKey: Approval["stationKey"];
  deliverableId: string;
  requestedAt: string;
}): Approval {
  return {
    id: input.id,
    workspaceId: input.workspaceId,
    runId: input.runId,
    packageId: input.packageId,
    packageVersionId: input.packageVersionId,
    packageInstallId: input.packageInstallId,
    stationKey: input.stationKey,
    deliverableId: input.deliverableId,
    status: "pending",
    requestedAt: input.requestedAt,
    resolvedAt: null,
    resolutionSummary: null
  };
}

export function approvePendingApproval(input: {
  approval: Approval;
  resolvedAt: string;
}): Approval {
  if (input.approval.status !== "pending") {
    throw new Error(`Approval "${input.approval.id}" is not pending`);
  }

  if (input.approval.resolvedAt !== null || input.approval.resolutionSummary !== null) {
    throw new Error(`Approval "${input.approval.id}" is malformed for pending resolution`);
  }

  return {
    ...input.approval,
    status: "approved",
    resolvedAt: input.resolvedAt
  };
}

export function requestChangesForPendingApproval(input: {
  approval: Approval;
  resolvedAt: string;
  resolutionSummary: string;
}): Approval {
  if (input.approval.status !== "pending") {
    throw new Error(`Approval "${input.approval.id}" is not pending`);
  }

  if (input.approval.resolvedAt !== null || input.approval.resolutionSummary !== null) {
    throw new Error(`Approval "${input.approval.id}" is malformed for pending resolution`);
  }

  const resolutionSummary = input.resolutionSummary.trim();
  if (resolutionSummary.length === 0) {
    throw new Error(`Approval "${input.approval.id}" requires a bounded resolution summary`);
  }

  return {
    ...input.approval,
    status: "changes_requested",
    resolvedAt: input.resolvedAt,
    resolutionSummary
  };
}
