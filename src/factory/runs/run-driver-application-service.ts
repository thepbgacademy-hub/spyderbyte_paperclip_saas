import type { BlueprintPackageDefinition, PackageInstall, Workspace } from "../domain/types.js";
import type { LLMProvider } from "../providers/provider-types.js";
import { startIntakeRun, submitIntakeAnswers, type IntakeAnswers, type IntakeRun } from "./intake-run-service.js";
import {
  completePositioningAnalysisWithProvider,
  startPositioningAnalysisStation
} from "./positioning-station-service.js";
import type { FactoryRunRepository, FactoryRunRow } from "./run-repository.js";
import type { FactoryRunDeliverableRepository } from "./deliverable-repository.js";
import type { FactoryRunApprovalRepository } from "./run-approval-repository.js";

function toRunRow(run: IntakeRun): FactoryRunRow {
  return {
    runId: run.id,
    tenantId: run.workspaceId,
    packageInstallId: run.packageInstallId,
    packageId: run.packageId,
    packageVersionId: run.packageVersionId,
    status: run.status,
    currentStationKey: run.currentStationKey,
    completedStationKey: run.completedStationKey,
    activeDeliverableId: run.activeDeliverableId,
    activeApprovalId: run.activeApprovalId,
    activeApprovalContractKey: run.activeApprovalContractKey,
    positioningRevisionGeneration: run.positioningRevisionGeneration,
    startedAt: run.startedAt,
    completedAt: run.completedAt
  };
}

function toIntakeRun(row: FactoryRunRow): IntakeRun {
  return {
    id: row.runId,
    workspaceId: row.tenantId,
    packageId: row.packageId,
    packageVersionId: row.packageVersionId,
    packageInstallId: row.packageInstallId,
    activeDeliverableId: row.activeDeliverableId,
    activeApprovalId: row.activeApprovalId,
    activeApprovalContractKey: row.activeApprovalContractKey,
    positioningRevisionGeneration: row.positioningRevisionGeneration,
    completedStationKey: row.completedStationKey,
    currentStationKey: row.currentStationKey,
    status: row.status,
    startedAt: row.startedAt,
    completedAt: row.completedAt
  };
}

/**
 * Drives one run through intake -> positioning on the stub provider
 * (DEC-040), persisting run state, both station deliverables, and the
 * checkpoint approval created by completePositioningAnalysisWithProvider
 * (TASK-077's requirement, subsumed here: the approval is created BY the
 * flow through createApprovalRequest, not by a direct pending-row insert).
 * Leaves the run at status "waiting_for_approval", stopped at the
 * positioning checkpoint -- the existing approve (TASK-076) and export
 * (TASK-079) slices carry it the rest of the way.
 *
 * Idempotent by construction: a persisted run row for runId is the guard --
 * re-invoking with the same runId returns that row without re-running any
 * station or re-persisting any deliverable/approval.
 */
export async function startFactoryRun(input: {
  runId: string;
  workspace: Workspace;
  packageInstall: PackageInstall;
  blueprint: BlueprintPackageDefinition;
  answers: IntakeAnswers;
  provider: LLMProvider;
  providerModel: string;
  providerSecret: string;
  startedAt: string;
  intakeCompletedAt: string;
  positioningRequestedAt: string;
  runRepository: FactoryRunRepository;
  deliverableRepository: FactoryRunDeliverableRepository;
  approvalRepository: FactoryRunApprovalRepository;
}): Promise<{ run: IntakeRun }> {
  const existing = await input.runRepository.findByRunId({
    tenantId: input.workspace.id,
    runId: input.runId
  });
  if (existing) {
    return { run: toIntakeRun(existing) };
  }

  const startedRun = startIntakeRun({
    id: input.runId,
    workspace: input.workspace,
    packageInstall: input.packageInstall,
    blueprint: input.blueprint,
    startedAt: input.startedAt
  });
  await input.runRepository.upsert(toRunRow(startedRun));

  const intakeCompletion = submitIntakeAnswers({
    run: startedRun,
    workspace: input.workspace,
    packageInstall: input.packageInstall,
    blueprint: input.blueprint,
    answers: input.answers,
    completedAt: input.intakeCompletedAt
  });
  await input.deliverableRepository.save({
    deliverableId: intakeCompletion.deliverable.id,
    tenantId: input.workspace.id,
    runId: input.runId,
    packageInstallId: input.packageInstall.id,
    stationKey: intakeCompletion.deliverable.stationKey,
    kind: intakeCompletion.deliverable.kind,
    title: intakeCompletion.deliverable.title,
    body: intakeCompletion.deliverable.body
  });
  await input.runRepository.upsert(toRunRow(intakeCompletion.run));

  const positioningStarted = startPositioningAnalysisStation({
    run: intakeCompletion.run,
    workspace: input.workspace,
    packageInstall: input.packageInstall,
    blueprint: input.blueprint
  });
  await input.runRepository.upsert(toRunRow(positioningStarted));

  const positioningCompletion = await completePositioningAnalysisWithProvider({
    run: positioningStarted,
    workspace: input.workspace,
    packageInstall: input.packageInstall,
    blueprint: input.blueprint,
    founderProfile: intakeCompletion.deliverable,
    requestedAt: input.positioningRequestedAt,
    provider: input.provider,
    providerModel: input.providerModel,
    providerSecret: input.providerSecret
  });
  await input.deliverableRepository.save({
    deliverableId: positioningCompletion.deliverable.id,
    tenantId: input.workspace.id,
    runId: input.runId,
    packageInstallId: input.packageInstall.id,
    stationKey: positioningCompletion.deliverable.stationKey,
    kind: positioningCompletion.deliverable.kind,
    title: positioningCompletion.deliverable.title,
    body: positioningCompletion.deliverable.body
  });
  await input.approvalRepository.createPendingApproval({
    row: {
      approvalId: positioningCompletion.approval.id,
      tenantId: input.workspace.id,
      runId: input.runId,
      packageId: positioningCompletion.approval.packageId,
      packageVersionId: positioningCompletion.approval.packageVersionId,
      packageInstallId: positioningCompletion.approval.packageInstallId,
      stationKey: positioningCompletion.approval.stationKey,
      deliverableId: positioningCompletion.approval.deliverableId,
      contractKey: "original",
      status: "pending",
      requestedAt: positioningCompletion.approval.requestedAt,
      resolvedAt: null,
      resolutionSummary: null
    }
  });
  await input.runRepository.upsert(toRunRow(positioningCompletion.run));

  return { run: positioningCompletion.run };
}
