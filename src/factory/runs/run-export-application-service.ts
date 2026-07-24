import type { FactoryRunDeliverableRepository } from "./deliverable-repository.js";
import type { FactoryRunApprovalRepository } from "./run-approval-repository.js";

export class FactoryRunExportNotReadyError extends Error {
  constructor(runId: string) {
    super(`Run "${runId}" is not ready for export`);
    this.name = "FactoryRunExportNotReadyError";
  }
}

export type FactoryRunLaunchKitDeliverable = {
  stationKey: string;
  kind: string;
  title: string;
  body: Record<string, unknown>;
};

export type FactoryRunLaunchKit = {
  runId: string;
  packageId: string;
  packageVersionId: string;
  packageInstallId: string;
  approvedAt: string;
  deliverables: FactoryRunLaunchKitDeliverable[];
};

/**
 * Assembles the TASK-079 Launch Kit for a tenant's run. Gated on the run
 * having an approved approval (the ready_for_export outcome from TASK-076);
 * a missing or not-yet-approved run is refused with the same
 * FactoryRunExportNotReadyError either way, so the caller cannot use the
 * response to distinguish "no such run" from "not approved yet" across
 * tenants. Run + package identity comes off the approval row (packageId,
 * packageVersionId, packageInstallId are already denormalized there), and
 * deliverables come from the tenant-scoped list added to
 * deliverable-repository.ts, in the repository's deterministic station_key
 * order.
 */
export async function assembleFactoryRunLaunchKit(input: {
  tenantId: string;
  runId: string;
  deliverableRepository: FactoryRunDeliverableRepository;
  approvalRepository: FactoryRunApprovalRepository;
}): Promise<FactoryRunLaunchKit> {
  const approval = await input.approvalRepository.findApprovedApprovalForRun({
    tenantId: input.tenantId,
    runId: input.runId
  });
  if (!approval) {
    throw new FactoryRunExportNotReadyError(input.runId);
  }

  const deliverables = await input.deliverableRepository.listDeliverablesForRun({
    tenantId: input.tenantId,
    runId: input.runId
  });

  return {
    runId: input.runId,
    packageId: approval.packageId,
    packageVersionId: approval.packageVersionId,
    packageInstallId: approval.packageInstallId,
    approvedAt: approval.resolvedAt ?? approval.requestedAt,
    deliverables: deliverables.map((deliverable) => ({
      stationKey: deliverable.stationKey,
      kind: deliverable.kind,
      title: deliverable.title,
      body: deliverable.body
    }))
  };
}
