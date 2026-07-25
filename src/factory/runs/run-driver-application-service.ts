import type {
  Approval,
  BlueprintPackageDefinition,
  FounderProfileDeliverable,
  PackageInstall,
  PositioningBriefDeliverable,
  Workspace
} from "../domain/types.js";
import type { LLMProvider } from "../providers/provider-types.js";
import { startIntakeRun, submitIntakeAnswers, type IntakeAnswers, type IntakeRun } from "./intake-run-service.js";
import {
  completePositioningAnalysisWithProvider,
  requestChangesForPositioningAnalysis,
  revisePositioningAnalysisAfterChangesRequested,
  startPositioningAnalysisStation
} from "./positioning-station-service.js";
import type { FactoryRunRepository, FactoryRunRow } from "./run-repository.js";
import type { FactoryRunDeliverableRepository, FactoryRunDeliverableRow } from "./deliverable-repository.js";
import type { FactoryRunApprovalRepository, FactoryRunApprovalRow } from "./run-approval-repository.js";

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

function toFounderProfileDeliverable(
  row: FactoryRunDeliverableRow,
  workspaceId: string,
  runId: string
): FounderProfileDeliverable {
  return {
    id: row.deliverableId,
    workspaceId,
    runId,
    stationKey: "intake",
    kind: "founder_profile",
    title: "Founder Profile",
    status: "ready",
    body: row.body as FounderProfileDeliverable["body"]
  };
}

function toPositioningBriefDeliverable(
  row: FactoryRunDeliverableRow,
  workspaceId: string,
  runId: string
): PositioningBriefDeliverable {
  return {
    id: row.deliverableId,
    workspaceId,
    runId,
    stationKey: "positioning",
    kind: "positioning_brief",
    title: "Positioning Brief",
    status: "ready",
    body: row.body as PositioningBriefDeliverable["body"]
  };
}

/**
 * Drives the ONE missing branch of the positioning approve/revise fork
 * (DEC-042): after a request_changes decision on the ORIGINAL positioning
 * contract has already been persisted (by decideFactoryRunApproval,
 * TASK-076 -- that call does not touch wfpc.factory_runs), this composes
 * the existing bounded transitions -- requestChangesForPositioningAnalysis
 * then revisePositioningAnalysisAfterChangesRequested -- to move the run
 * row itself to the revision-ready state and produce + persist the
 * revision_1 brief and its pending approval. Stub/deterministic only
 * (DEC-040): no live provider is involved in the revision.
 *
 * Idempotent by construction: a run row already at
 * positioningRevisionGeneration 1 is the guard -- re-invoking for the same
 * runId returns that row without re-deriving or re-persisting anything.
 */
export async function reviseFactoryRunPositioning(input: {
  workspace: Workspace;
  packageInstall: PackageInstall;
  blueprint: BlueprintPackageDefinition;
  runId: string;
  decidedApproval: FactoryRunApprovalRow;
  revisionRequestedAt: string;
  runRepository: FactoryRunRepository;
  deliverableRepository: FactoryRunDeliverableRepository;
  approvalRepository: FactoryRunApprovalRepository;
}): Promise<{ run: IntakeRun }> {
  const existingRunRow = await input.runRepository.findByRunId({
    tenantId: input.workspace.id,
    runId: input.runId
  });
  if (!existingRunRow) {
    throw new Error(`Run "${input.runId}" was not found`);
  }
  if (existingRunRow.positioningRevisionGeneration === 1) {
    return { run: toIntakeRun(existingRunRow) };
  }

  const founderProfileRow = await input.deliverableRepository.findById({
    tenantId: input.workspace.id,
    deliverableId: `deliverable_${input.runId}_founder_profile`
  });
  if (!founderProfileRow) {
    throw new Error(`Run "${input.runId}" is missing its founder profile deliverable`);
  }
  const previousBriefRow = await input.deliverableRepository.findById({
    tenantId: input.workspace.id,
    deliverableId: `deliverable_${input.runId}_positioning_brief`
  });
  if (!previousBriefRow) {
    throw new Error(`Run "${input.runId}" is missing its original positioning brief deliverable`);
  }

  const run = toIntakeRun(existingRunRow);
  const founderProfile = toFounderProfileDeliverable(founderProfileRow, input.workspace.id, input.runId);
  const previousPositioningBrief = toPositioningBriefDeliverable(previousBriefRow, input.workspace.id, input.runId);

  const pendingApproval: Approval = {
    id: input.decidedApproval.approvalId,
    workspaceId: input.workspace.id,
    runId: input.runId,
    packageId: input.decidedApproval.packageId,
    packageVersionId: input.decidedApproval.packageVersionId,
    packageInstallId: input.decidedApproval.packageInstallId,
    stationKey: input.decidedApproval.stationKey,
    deliverableId: input.decidedApproval.deliverableId,
    status: "pending",
    requestedAt: input.decidedApproval.requestedAt,
    resolvedAt: null,
    resolutionSummary: null
  };
  const requestedChangesAt = input.decidedApproval.resolvedAt ?? input.revisionRequestedAt;
  const resolutionSummary = input.decidedApproval.resolutionSummary ?? "";

  const requestedChanges = requestChangesForPositioningAnalysis({
    run,
    workspace: input.workspace,
    packageInstall: input.packageInstall,
    blueprint: input.blueprint,
    positioningBrief: previousPositioningBrief,
    approval: pendingApproval,
    requestedChangesAt,
    resolutionSummary
  });
  await input.runRepository.upsert(toRunRow(requestedChanges.run));

  const revised = revisePositioningAnalysisAfterChangesRequested({
    run: requestedChanges.run,
    workspace: input.workspace,
    packageInstall: input.packageInstall,
    blueprint: input.blueprint,
    founderProfile,
    previousPositioningBrief,
    previousApproval: requestedChanges.approval,
    revisionSummary: resolutionSummary,
    requestedAt: input.revisionRequestedAt
  });

  await input.deliverableRepository.save({
    deliverableId: revised.deliverable.id,
    tenantId: input.workspace.id,
    runId: input.runId,
    packageInstallId: input.packageInstall.id,
    stationKey: revised.deliverable.stationKey,
    kind: revised.deliverable.kind,
    title: revised.deliverable.title,
    body: revised.deliverable.body
  });
  await input.approvalRepository.createPendingApproval({
    row: {
      approvalId: revised.approval.id,
      tenantId: input.workspace.id,
      runId: input.runId,
      packageId: revised.approval.packageId,
      packageVersionId: revised.approval.packageVersionId,
      packageInstallId: revised.approval.packageInstallId,
      stationKey: revised.approval.stationKey,
      deliverableId: revised.approval.deliverableId,
      contractKey: "revision_1",
      status: "pending",
      requestedAt: revised.approval.requestedAt,
      resolvedAt: null,
      resolutionSummary: null
    }
  });
  await input.runRepository.upsert(toRunRow(revised.run));

  return { run: revised.run };
}
