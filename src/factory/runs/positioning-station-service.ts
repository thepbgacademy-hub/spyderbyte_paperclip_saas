import type {
  Approval,
  BlueprintPackageDefinition,
  FounderProfileDeliverable,
  PackageInstall,
  PositioningBriefDeliverable,
  Workspace
} from "../domain/types.js";
import {
  approvePendingApproval,
  createApprovalRequest,
  requestChangesForPendingApproval
} from "../approvals/approval-service.js";
import type { IntakeRun } from "./intake-run-service.js";
import type { LLMProvider } from "../providers/provider-types.js";

function resolvePositioningStation(blueprint: BlueprintPackageDefinition) {
  const positioningStation = blueprint.stations.find((station) => station.key === "positioning");
  if (!positioningStation || positioningStation.kind !== "analysis") {
    throw new Error(
      `Blueprint package "${blueprint.packageId}" does not define a positioning analysis station`
    );
  }

  return positioningStation;
}

function assertInstallOwnership(workspace: Workspace, packageInstall: PackageInstall) {
  if (packageInstall.workspaceId !== workspace.id) {
    throw new Error(
      `Blueprint install "${packageInstall.id}" does not belong to workspace "${workspace.id}"`
    );
  }

  if (!packageInstall.enabled) {
    throw new Error(`Blueprint install "${packageInstall.id}" is disabled`);
  }
}

function assertInstallMatchesBlueprint(
  packageInstall: PackageInstall,
  blueprint: BlueprintPackageDefinition
) {
  if (packageInstall.packageId !== blueprint.packageId) {
    throw new Error(
      `Blueprint install "${packageInstall.id}" is bound to package "${packageInstall.packageId}", not "${blueprint.packageId}"`
    );
  }

  if (packageInstall.packageVersionId !== blueprint.packageVersionId) {
    throw new Error(
      `Blueprint install "${packageInstall.id}" is bound to package version "${packageInstall.packageVersionId}", not "${blueprint.packageVersionId}"`
    );
  }
}

function isOriginalPositioningApprovalContract(runId: string, approval: Approval, brief: PositioningBriefDeliverable) {
  return (
    brief.id === `deliverable_${runId}_positioning_brief` &&
    approval.id === `approval_${runId}_positioning`
  );
}

function isFirstRevisedPositioningApprovalContract(
  runId: string,
  approval: Approval,
  brief: PositioningBriefDeliverable
) {
  return (
    brief.id === `deliverable_${runId}_positioning_brief_revision_1` &&
    approval.id === `approval_${runId}_positioning_revision_1`
  );
}

export function startPositioningAnalysisStation(input: {
  run: IntakeRun;
  workspace: Workspace;
  packageInstall: PackageInstall;
  blueprint: BlueprintPackageDefinition;
}): IntakeRun {
  assertInstallOwnership(input.workspace, input.packageInstall);
  assertInstallMatchesBlueprint(input.packageInstall, input.blueprint);
  resolvePositioningStation(input.blueprint);

  if (input.run.workspaceId !== input.workspace.id) {
    throw new Error(`Run "${input.run.id}" does not belong to workspace "${input.workspace.id}"`);
  }

  if (input.run.packageId !== input.blueprint.packageId) {
    throw new Error(
      `Run "${input.run.id}" does not target blueprint package "${input.blueprint.packageId}"`
    );
  }

  if (input.run.packageVersionId !== input.blueprint.packageVersionId) {
    throw new Error(
      `Run "${input.run.id}" is pinned to package version "${input.run.packageVersionId}", not "${input.blueprint.packageVersionId}"`
    );
  }

  if (input.run.packageInstallId !== input.packageInstall.id) {
    throw new Error(
      `Run "${input.run.id}" is bound to install "${input.run.packageInstallId}", not "${input.packageInstall.id}"`
    );
  }

  if (
    input.run.currentStationKey !== null ||
    input.run.status !== "completed" ||
    input.run.completedStationKey !== "intake"
  ) {
    if (input.run.status === "completed" && input.run.completedStationKey === "positioning") {
      throw new Error(
        `Run "${input.run.id}" cannot restart the bounded positioning station after terminal completion`
      );
    }

    throw new Error(
      `Run "${input.run.id}" must complete intake before the positioning analysis station can start`
    );
  }

  return {
    ...input.run,
    completedStationKey: null,
    currentStationKey: "positioning",
    status: "running",
    completedAt: null
  };
}

export function completePositioningAnalysis(input: {
  run: IntakeRun;
  workspace: Workspace;
  packageInstall: PackageInstall;
  blueprint: BlueprintPackageDefinition;
  founderProfile: FounderProfileDeliverable;
  requestedAt: string;
}): { run: IntakeRun; deliverable: PositioningBriefDeliverable; approval: Approval } {
  assertInstallOwnership(input.workspace, input.packageInstall);
  assertInstallMatchesBlueprint(input.packageInstall, input.blueprint);
  resolvePositioningStation(input.blueprint);

  if (input.run.workspaceId !== input.workspace.id) {
    throw new Error(`Run "${input.run.id}" does not belong to workspace "${input.workspace.id}"`);
  }

  if (input.run.packageId !== input.blueprint.packageId) {
    throw new Error(
      `Run "${input.run.id}" does not target blueprint package "${input.blueprint.packageId}"`
    );
  }

  if (input.run.packageVersionId !== input.blueprint.packageVersionId) {
    throw new Error(
      `Run "${input.run.id}" is pinned to package version "${input.run.packageVersionId}", not "${input.blueprint.packageVersionId}"`
    );
  }

  if (input.run.packageInstallId !== input.packageInstall.id) {
    throw new Error(
      `Run "${input.run.id}" is bound to install "${input.run.packageInstallId}", not "${input.packageInstall.id}"`
    );
  }

  if (input.run.currentStationKey !== "positioning" || input.run.status !== "running") {
    throw new Error(`Run "${input.run.id}" is not actively running the positioning analysis station`);
  }

  if (
    input.founderProfile.workspaceId !== input.workspace.id ||
    input.founderProfile.runId !== input.run.id ||
    input.founderProfile.stationKey !== "intake" ||
    input.founderProfile.kind !== "founder_profile"
  ) {
    throw new Error(
      `Founder profile "${input.founderProfile.id}" does not belong to the positioning analysis input contract`
    );
  }

  const deliverable: PositioningBriefDeliverable = {
    id: `deliverable_${input.run.id}_positioning_brief`,
    workspaceId: input.workspace.id,
    runId: input.run.id,
    stationKey: "positioning",
    kind: "positioning_brief",
    title: "Positioning Brief",
    status: "ready",
    body: {
      headline:
        `${input.founderProfile.body.businessName} helps ${input.founderProfile.body.targetAudience} ` +
        `${input.founderProfile.body.primaryGoal}.`,
      audience: input.founderProfile.body.targetAudience,
      primaryGoal: input.founderProfile.body.primaryGoal,
      positioningSummary:
        `${input.founderProfile.body.businessName} should position itself as the focused guide for ` +
        `${input.founderProfile.body.targetAudience} who need to ${input.founderProfile.body.primaryGoal}.`
    }
  };
  const approval = createApprovalRequest({
    id: `approval_${input.run.id}_positioning`,
    workspaceId: input.workspace.id,
    runId: input.run.id,
    packageId: input.blueprint.packageId,
    packageVersionId: input.blueprint.packageVersionId,
    packageInstallId: input.packageInstall.id,
    stationKey: "positioning",
    deliverableId: deliverable.id,
    requestedAt: input.requestedAt
  });

  return {
    run: {
      ...input.run,
      activeDeliverableId: deliverable.id,
      activeApprovalId: approval.id,
      activeApprovalContractKey: "original",
      positioningRevisionGeneration: 0,
      status: "waiting_for_approval",
      completedAt: null
    },
    deliverable,
    approval
  };
}

/**
 * Same bounded transition as completePositioningAnalysis, but sources the
 * deliverable's positioning summary from an LLMProvider.complete() call
 * instead of the template literal (DEC-040 / TASK-055 AC2). The stub
 * provider satisfies this in the walking skeleton; a live provider is a
 * later, isolated swap (TASK-066) behind the same LLMProvider interface.
 */
export async function completePositioningAnalysisWithProvider(input: {
  run: IntakeRun;
  workspace: Workspace;
  packageInstall: PackageInstall;
  blueprint: BlueprintPackageDefinition;
  founderProfile: FounderProfileDeliverable;
  requestedAt: string;
  provider: LLMProvider;
  providerModel: string;
  providerSecret: string;
}): Promise<{ run: IntakeRun; deliverable: PositioningBriefDeliverable; approval: Approval }> {
  const templated = completePositioningAnalysis({
    run: input.run,
    workspace: input.workspace,
    packageInstall: input.packageInstall,
    blueprint: input.blueprint,
    founderProfile: input.founderProfile,
    requestedAt: input.requestedAt
  });

  const completion = await input.provider.complete(
    {
      model: input.providerModel,
      system:
        "You are the market positioning specialist. Write one concise positioning summary sentence for the founder's business.",
      messages: [
        {
          role: "user",
          content:
            `Business: ${input.founderProfile.body.businessName}. ` +
            `Audience: ${input.founderProfile.body.targetAudience}. ` +
            `Goal: ${input.founderProfile.body.primaryGoal}.`
        }
      ]
    },
    input.providerSecret
  );

  return {
    ...templated,
    deliverable: {
      ...templated.deliverable,
      body: {
        ...templated.deliverable.body,
        positioningSummary: completion.text
      }
    }
  };
}

export function approvePositioningAnalysis(input: {
  run: IntakeRun;
  workspace: Workspace;
  packageInstall: PackageInstall;
  blueprint: BlueprintPackageDefinition;
  positioningBrief: PositioningBriefDeliverable;
  approval: Approval;
  approvedAt: string;
}): { run: IntakeRun; approval: Approval } {
  assertInstallOwnership(input.workspace, input.packageInstall);
  assertInstallMatchesBlueprint(input.packageInstall, input.blueprint);
  resolvePositioningStation(input.blueprint);

  if (input.run.workspaceId !== input.workspace.id) {
    throw new Error(`Run "${input.run.id}" does not belong to workspace "${input.workspace.id}"`);
  }

  if (input.run.packageId !== input.blueprint.packageId) {
    throw new Error(
      `Run "${input.run.id}" does not target blueprint package "${input.blueprint.packageId}"`
    );
  }

  if (input.run.packageVersionId !== input.blueprint.packageVersionId) {
    throw new Error(
      `Run "${input.run.id}" is pinned to package version "${input.run.packageVersionId}", not "${input.blueprint.packageVersionId}"`
    );
  }

  if (input.run.packageInstallId !== input.packageInstall.id) {
    throw new Error(
      `Run "${input.run.id}" is bound to install "${input.run.packageInstallId}", not "${input.packageInstall.id}"`
    );
  }

  if (input.run.currentStationKey !== "positioning" || input.run.status !== "waiting_for_approval") {
    throw new Error(`Run "${input.run.id}" is not awaiting positioning approval`);
  }

  if (
    input.positioningBrief.workspaceId !== input.workspace.id ||
    input.positioningBrief.runId !== input.run.id ||
    input.positioningBrief.stationKey !== "positioning" ||
    input.positioningBrief.kind !== "positioning_brief"
  ) {
    throw new Error(
      `Positioning brief "${input.positioningBrief.id}" does not belong to the positioning approval contract`
    );
  }

  if (
    input.approval.workspaceId !== input.workspace.id ||
    input.approval.runId !== input.run.id ||
    input.approval.packageId !== input.blueprint.packageId ||
    input.approval.packageVersionId !== input.blueprint.packageVersionId ||
    input.approval.packageInstallId !== input.packageInstall.id ||
    input.approval.stationKey !== "positioning" ||
    input.approval.deliverableId !== input.positioningBrief.id
  ) {
    throw new Error(
      `Approval "${input.approval.id}" does not belong to the positioning approval contract`
    );
  }

  if (
    input.run.activeDeliverableId !== input.positioningBrief.id ||
    input.run.activeApprovalId !== input.approval.id
  ) {
    throw new Error(
      `Approval "${input.approval.id}" does not belong to the active positioning approval contract`
    );
  }

  const belongsToBoundedContract =
    input.run.activeApprovalContractKey === "original" &&
    input.run.positioningRevisionGeneration === 0
      ? isOriginalPositioningApprovalContract(input.run.id, input.approval, input.positioningBrief)
      : input.run.activeApprovalContractKey === "revision_1" &&
          input.run.positioningRevisionGeneration === 1
        ? isFirstRevisedPositioningApprovalContract(
            input.run.id,
            input.approval,
            input.positioningBrief
          )
        : false;

  if (!belongsToBoundedContract) {
    throw new Error(
      `Approval "${input.approval.id}" does not belong to the bounded positioning approval contract`
    );
  }

  return {
    run: {
      ...input.run,
      activeDeliverableId: null,
      activeApprovalId: null,
      activeApprovalContractKey: null,
      positioningRevisionGeneration: input.run.positioningRevisionGeneration,
      completedStationKey: "positioning",
      currentStationKey: null,
      status: "completed",
      completedAt: input.approvedAt
    },
    approval: approvePendingApproval({
      approval: input.approval,
      resolvedAt: input.approvedAt
    })
  };
}

export function requestChangesForPositioningAnalysis(input: {
  run: IntakeRun;
  workspace: Workspace;
  packageInstall: PackageInstall;
  blueprint: BlueprintPackageDefinition;
  positioningBrief: PositioningBriefDeliverable;
  approval: Approval;
  requestedChangesAt: string;
  resolutionSummary: string;
}): { run: IntakeRun; approval: Approval } {
  assertInstallOwnership(input.workspace, input.packageInstall);
  assertInstallMatchesBlueprint(input.packageInstall, input.blueprint);
  resolvePositioningStation(input.blueprint);

  if (input.run.workspaceId !== input.workspace.id) {
    throw new Error(`Run "${input.run.id}" does not belong to workspace "${input.workspace.id}"`);
  }

  if (input.run.packageId !== input.blueprint.packageId) {
    throw new Error(
      `Run "${input.run.id}" does not target blueprint package "${input.blueprint.packageId}"`
    );
  }

  if (input.run.packageVersionId !== input.blueprint.packageVersionId) {
    throw new Error(
      `Run "${input.run.id}" is pinned to package version "${input.run.packageVersionId}", not "${input.blueprint.packageVersionId}"`
    );
  }

  if (input.run.packageInstallId !== input.packageInstall.id) {
    throw new Error(
      `Run "${input.run.id}" is bound to install "${input.run.packageInstallId}", not "${input.packageInstall.id}"`
    );
  }

  if (input.run.currentStationKey !== "positioning" || input.run.status !== "waiting_for_approval") {
    throw new Error(`Run "${input.run.id}" is not awaiting positioning approval`);
  }

  if (
    input.positioningBrief.workspaceId !== input.workspace.id ||
    input.positioningBrief.runId !== input.run.id ||
    input.positioningBrief.stationKey !== "positioning" ||
    input.positioningBrief.kind !== "positioning_brief"
  ) {
    throw new Error(
      `Positioning brief "${input.positioningBrief.id}" does not belong to the positioning approval contract`
    );
  }

  if (
    input.approval.workspaceId !== input.workspace.id ||
    input.approval.runId !== input.run.id ||
    input.approval.packageId !== input.blueprint.packageId ||
    input.approval.packageVersionId !== input.blueprint.packageVersionId ||
    input.approval.packageInstallId !== input.packageInstall.id ||
    input.approval.stationKey !== "positioning" ||
    input.approval.deliverableId !== input.positioningBrief.id
  ) {
    throw new Error(
      `Approval "${input.approval.id}" does not belong to the positioning approval contract`
    );
  }

  if (
    input.run.activeDeliverableId !== input.positioningBrief.id ||
    input.run.activeApprovalId !== input.approval.id
  ) {
    throw new Error(
      `Approval "${input.approval.id}" does not belong to the active positioning approval contract`
    );
  }

  if (!isOriginalPositioningApprovalContract(input.run.id, input.approval, input.positioningBrief)) {
    throw new Error(
      `Approval "${input.approval.id}" does not belong to the first bounded positioning approval contract`
    );
  }

  return {
    run: {
      ...input.run,
      activeDeliverableId: null,
      activeApprovalId: null,
      activeApprovalContractKey: null,
      positioningRevisionGeneration: 0,
      completedStationKey: null,
      currentStationKey: "positioning",
      status: "waiting_for_input",
      completedAt: null
    },
    approval: requestChangesForPendingApproval({
      approval: input.approval,
      resolvedAt: input.requestedChangesAt,
      resolutionSummary: input.resolutionSummary
    })
  };
}

export function revisePositioningAnalysisAfterChangesRequested(input: {
  run: IntakeRun;
  workspace: Workspace;
  packageInstall: PackageInstall;
  blueprint: BlueprintPackageDefinition;
  founderProfile: FounderProfileDeliverable;
  previousPositioningBrief: PositioningBriefDeliverable;
  previousApproval: Approval;
  revisionSummary: string;
  requestedAt: string;
}): { run: IntakeRun; deliverable: PositioningBriefDeliverable; approval: Approval } {
  assertInstallOwnership(input.workspace, input.packageInstall);
  assertInstallMatchesBlueprint(input.packageInstall, input.blueprint);
  resolvePositioningStation(input.blueprint);

  if (input.run.workspaceId !== input.workspace.id) {
    throw new Error(`Run "${input.run.id}" does not belong to workspace "${input.workspace.id}"`);
  }

  if (input.run.packageId !== input.blueprint.packageId) {
    throw new Error(
      `Run "${input.run.id}" does not target blueprint package "${input.blueprint.packageId}"`
    );
  }

  if (input.run.packageVersionId !== input.blueprint.packageVersionId) {
    throw new Error(
      `Run "${input.run.id}" is pinned to package version "${input.run.packageVersionId}", not "${input.blueprint.packageVersionId}"`
    );
  }

  if (input.run.packageInstallId !== input.packageInstall.id) {
    throw new Error(
      `Run "${input.run.id}" is bound to install "${input.run.packageInstallId}", not "${input.packageInstall.id}"`
    );
  }

  if (input.run.currentStationKey !== "positioning" || input.run.status !== "waiting_for_input") {
    throw new Error(`Run "${input.run.id}" is not ready for bounded positioning revision input`);
  }

  if (
    input.founderProfile.workspaceId !== input.workspace.id ||
    input.founderProfile.runId !== input.run.id ||
    input.founderProfile.stationKey !== "intake" ||
    input.founderProfile.kind !== "founder_profile"
  ) {
    throw new Error(
      `Founder profile "${input.founderProfile.id}" does not belong to the positioning analysis input contract`
    );
  }

  if (
    input.previousPositioningBrief.workspaceId !== input.workspace.id ||
    input.previousPositioningBrief.runId !== input.run.id ||
    input.previousPositioningBrief.stationKey !== "positioning" ||
    input.previousPositioningBrief.kind !== "positioning_brief" ||
    input.previousPositioningBrief.id !== `deliverable_${input.run.id}_positioning_brief`
  ) {
    throw new Error(
      `Positioning brief "${input.previousPositioningBrief.id}" does not belong to the positioning revision contract`
    );
  }

  if (
    input.previousApproval.workspaceId !== input.workspace.id ||
    input.previousApproval.runId !== input.run.id ||
    input.previousApproval.packageId !== input.blueprint.packageId ||
    input.previousApproval.packageVersionId !== input.blueprint.packageVersionId ||
    input.previousApproval.packageInstallId !== input.packageInstall.id ||
    input.previousApproval.stationKey !== "positioning" ||
    input.previousApproval.id !== `approval_${input.run.id}_positioning` ||
    input.previousApproval.deliverableId !== input.previousPositioningBrief.id ||
    input.previousApproval.status !== "changes_requested" ||
    input.previousApproval.resolvedAt === null ||
    input.previousApproval.resolutionSummary === null ||
    input.previousApproval.resolutionSummary.trim().length === 0
  ) {
    throw new Error(
      `Approval "${input.previousApproval.id}" does not belong to the positioning revision contract`
    );
  }

  const revisionSummary = input.revisionSummary.trim();
  if (revisionSummary.length === 0) {
    throw new Error(`Run "${input.run.id}" requires a bounded revision summary`);
  }

  const deliverable: PositioningBriefDeliverable = {
    id: `deliverable_${input.run.id}_positioning_brief_revision_1`,
    workspaceId: input.workspace.id,
    runId: input.run.id,
    stationKey: "positioning",
    kind: "positioning_brief",
    title: "Positioning Brief",
    status: "ready",
    body: {
      headline:
        `${input.founderProfile.body.businessName} helps ${input.founderProfile.body.targetAudience} ` +
        `${input.founderProfile.body.primaryGoal}.`,
      audience: input.founderProfile.body.targetAudience,
      primaryGoal: input.founderProfile.body.primaryGoal,
      positioningSummary:
        `${input.founderProfile.body.businessName} should position itself as the focused guide for ` +
        `${input.founderProfile.body.targetAudience} who need to ${input.founderProfile.body.primaryGoal}. ` +
        `Revision focus: ${revisionSummary}`
    }
  };

  const approval = createApprovalRequest({
    id: `approval_${input.run.id}_positioning_revision_1`,
    workspaceId: input.workspace.id,
    runId: input.run.id,
    packageId: input.blueprint.packageId,
    packageVersionId: input.blueprint.packageVersionId,
    packageInstallId: input.packageInstall.id,
    stationKey: "positioning",
    deliverableId: deliverable.id,
    requestedAt: input.requestedAt
  });

  return {
    run: {
      ...input.run,
      activeDeliverableId: deliverable.id,
      activeApprovalId: approval.id,
      activeApprovalContractKey: "revision_1",
      positioningRevisionGeneration: 1,
      completedStationKey: null,
      currentStationKey: "positioning",
      status: "waiting_for_approval",
      completedAt: null
    },
    deliverable,
    approval
  };
}
