import type {
  BlueprintPackageDefinition,
  FounderProfileDeliverable,
  PackageInstall,
  RunStatus,
  Workspace
} from "../domain/types.js";

export interface IntakeRun {
  id: string;
  workspaceId: string;
  packageId: string;
  packageInstallId: string;
  activeDeliverableId: string | null;
  activeApprovalId: string | null;
  activeApprovalContractKey: "original" | "revision_1" | null;
  positioningRevisionGeneration: 0 | 1;
  completedStationKey: "intake" | "positioning" | null;
  currentStationKey: "intake" | "positioning" | null;
  status: RunStatus;
  startedAt: string;
  completedAt: string | null;
}

export interface IntakeAnswers {
  founderName: string;
  businessName: string;
  primaryGoal: string;
  targetAudience: string;
}

function resolveIntakeStation(blueprint: BlueprintPackageDefinition) {
  const intakeStation = blueprint.stations.find((station) => station.key === "intake");
  if (!intakeStation || intakeStation.kind !== "structured_interview") {
    throw new Error(`Blueprint package "${blueprint.id}" does not define an intake station`);
  }

  return intakeStation;
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
  if (packageInstall.packageId !== blueprint.id) {
    throw new Error(
      `Blueprint install "${packageInstall.id}" is bound to package "${packageInstall.packageId}", not "${blueprint.id}"`
    );
  }
}

export function startIntakeRun(input: {
  id: string;
  workspace: Workspace;
  packageInstall: PackageInstall;
  blueprint: BlueprintPackageDefinition;
  startedAt: string;
}): IntakeRun {
  assertInstallOwnership(input.workspace, input.packageInstall);
  assertInstallMatchesBlueprint(input.packageInstall, input.blueprint);
  resolveIntakeStation(input.blueprint);

  return {
    id: input.id,
    workspaceId: input.workspace.id,
    packageId: input.blueprint.id,
    packageInstallId: input.packageInstall.id,
    activeDeliverableId: null,
    activeApprovalId: null,
    activeApprovalContractKey: null,
    positioningRevisionGeneration: 0,
    completedStationKey: null,
    currentStationKey: "intake",
    status: "waiting_for_input",
    startedAt: input.startedAt,
    completedAt: null
  };
}

export function submitIntakeAnswers(input: {
  run: IntakeRun;
  workspace: Workspace;
  packageInstall: PackageInstall;
  blueprint: BlueprintPackageDefinition;
  answers: IntakeAnswers;
  completedAt: string;
}): { run: IntakeRun; deliverable: FounderProfileDeliverable } {
  assertInstallOwnership(input.workspace, input.packageInstall);
  assertInstallMatchesBlueprint(input.packageInstall, input.blueprint);
  resolveIntakeStation(input.blueprint);

  if (input.run.workspaceId !== input.workspace.id) {
    throw new Error(`Run "${input.run.id}" does not belong to workspace "${input.workspace.id}"`);
  }

  if (input.run.packageId !== input.blueprint.id) {
    throw new Error(`Run "${input.run.id}" does not target blueprint package "${input.blueprint.id}"`);
  }

  if (input.run.packageInstallId !== input.packageInstall.id) {
    throw new Error(
      `Run "${input.run.id}" is bound to install "${input.run.packageInstallId}", not "${input.packageInstall.id}"`
    );
  }

  if (input.run.currentStationKey !== "intake" || input.run.status !== "waiting_for_input") {
    throw new Error(`Run "${input.run.id}" is not ready to accept intake answers`);
  }

  const deliverable: FounderProfileDeliverable = {
    id: `deliverable_${input.run.id}_founder_profile`,
    workspaceId: input.workspace.id,
    runId: input.run.id,
    stationKey: "intake",
    kind: "founder_profile",
    title: "Founder Profile",
    status: "ready",
    body: {
      ...input.answers,
      summary:
        `${input.answers.founderName} is building ${input.answers.businessName} for ` +
        `${input.answers.targetAudience} with the immediate goal: ${input.answers.primaryGoal}.`
    }
  };

  return {
    run: {
      ...input.run,
      activeDeliverableId: null,
      activeApprovalId: null,
      activeApprovalContractKey: null,
      positioningRevisionGeneration: 0,
      completedStationKey: "intake",
      currentStationKey: null,
      status: "completed",
      completedAt: input.completedAt
    },
    deliverable
  };
}
