import { TenantMembershipRequiredError } from "../db/supabase-repositories.js";
import { FactoryPackageInstallApiError } from "./factory-package-install-api.js";
import type { BlueprintPackageDefinition, PackageInstall, Workspace } from "../factory/domain/types.js";
import type { LLMProvider } from "../factory/providers/provider-types.js";
import { startFactoryRun } from "../factory/runs/run-driver-application-service.js";
import type { IntakeAnswers, IntakeRun } from "../factory/runs/intake-run-service.js";
import type { FactoryRunRepository } from "../factory/runs/run-repository.js";
import type { FactoryRunDeliverableRepository } from "../factory/runs/deliverable-repository.js";
import type { FactoryRunApprovalRepository } from "../factory/runs/run-approval-repository.js";
import type { FactoryPackageInstallRepository } from "../factory/packages/package-install-repository.js";

export type FactoryRunDriverApiSession = {
  userId: string;
  tenantId: string;
};

export class FactoryRunDriverApiError extends Error {
  constructor(
    readonly code: "unauthorized" | "forbidden" | "invalid_request" | "not_found",
    message: string
  ) {
    super(message);
    this.name = "FactoryRunDriverApiError";
  }
}

export type FactoryRunStatusDto = {
  runId: string;
  packageInstallId: string;
  packageId: string;
  packageVersionId: string;
  status: string;
  currentStationKey: string | null;
  completedStationKey: string | null;
  startedAt: string;
  completedAt: string | null;
};

export type FactoryRunDriverApiDeps = {
  authenticate(input: { authorization: string; cookie?: string }): Promise<FactoryRunDriverApiSession | null>;
  requireTenantMember(input: { tenantId: string; userId: string }): Promise<void>;
  packageInstallRepository: FactoryPackageInstallRepository;
  loadBlueprintPackageForInstall(input: {
    packageId: string;
    packageVersionId: string;
  }): Promise<BlueprintPackageDefinition>;
  provider: LLMProvider;
  providerModel: string;
  runRepository: FactoryRunRepository;
  deliverableRepository: FactoryRunDeliverableRepository;
  approvalRepository: FactoryRunApprovalRepository;
  createRunId(): string;
};

type AuthenticatedRequest = {
  authorization: string;
  cookie?: string;
};

function toStatusDto(run: IntakeRun): FactoryRunStatusDto {
  return {
    runId: run.id,
    packageInstallId: run.packageInstallId,
    packageId: run.packageId,
    packageVersionId: run.packageVersionId,
    status: run.status,
    currentStationKey: run.currentStationKey,
    completedStationKey: run.completedStationKey,
    startedAt: run.startedAt,
    completedAt: run.completedAt
  };
}

function toPackageInstallDomain(row: {
  installId: string;
  tenantId: string;
  packageId: string;
  packageVersionId: string;
  previousPackageVersionId: string | null;
  installStatus: PackageInstall["status"];
  installedAt: string;
  updatedAt: string | null;
  disabledAt: string | null;
  uninstalledAt: string | null;
  permissionSnapshot: PackageInstall["permissionSnapshot"];
  permissionDiff: PackageInstall["permissionDiff"];
}): PackageInstall {
  return {
    id: row.installId,
    workspaceId: row.tenantId,
    packageId: row.packageId,
    packageVersionId: row.packageVersionId,
    previousPackageVersionId: row.previousPackageVersionId,
    status: row.installStatus,
    installedAt: row.installedAt,
    updatedAt: row.updatedAt,
    disabledAt: row.disabledAt,
    uninstalledAt: row.uninstalledAt,
    enabled: row.installStatus === "enabled",
    permissionSnapshot: row.permissionSnapshot,
    permissionDiff: row.permissionDiff
  };
}

export function createFactoryRunDriverApi(deps: FactoryRunDriverApiDeps) {
  async function createActor(request: AuthenticatedRequest) {
    const session = await deps.authenticate({
      authorization: request.authorization,
      ...(request.cookie ? { cookie: request.cookie } : {})
    });
    if (!session) {
      throw new FactoryRunDriverApiError("unauthorized", "Unauthorized");
    }

    await deps.requireTenantMember({
      tenantId: session.tenantId,
      userId: session.userId
    });

    return { userId: session.userId, tenantId: session.tenantId };
  }

  return {
    async startRun(
      request: AuthenticatedRequest & {
        packageInstallId: string;
        answers: IntakeAnswers;
        runId?: string;
        startedAt: string;
      }
    ): Promise<FactoryRunStatusDto> {
      const actor = await withApiErrors(() => createActor(request));

      const installRow = await deps.packageInstallRepository.findInstallById({
        tenantId: actor.tenantId,
        installId: request.packageInstallId
      });
      if (!installRow) {
        throw new FactoryRunDriverApiError(
          "not_found",
          `Blueprint install "${request.packageInstallId}" was not found`
        );
      }

      const blueprint = await withApiErrors(() =>
        deps.loadBlueprintPackageForInstall({
          packageId: installRow.packageId,
          packageVersionId: installRow.packageVersionId
        })
      );

      const workspace: Workspace = {
        id: actor.tenantId,
        name: actor.tenantId,
        slug: actor.tenantId,
        status: "active",
        createdAt: request.startedAt
      };

      const runId = request.runId ?? deps.createRunId();

      const result = await withApiErrors(() =>
        startFactoryRun({
          runId,
          workspace,
          packageInstall: toPackageInstallDomain(installRow),
          blueprint,
          answers: request.answers,
          provider: deps.provider,
          providerModel: deps.providerModel,
          providerSecret: "stub-provider-no-real-secret",
          startedAt: request.startedAt,
          intakeCompletedAt: request.startedAt,
          positioningRequestedAt: request.startedAt,
          runRepository: deps.runRepository,
          deliverableRepository: deps.deliverableRepository,
          approvalRepository: deps.approvalRepository
        })
      );

      return toStatusDto(result.run);
    },

    async getRunStatus(request: AuthenticatedRequest & { runId: string }): Promise<FactoryRunStatusDto> {
      const actor = await withApiErrors(() => createActor(request));

      const row = await deps.runRepository.findByRunId({ tenantId: actor.tenantId, runId: request.runId });
      if (!row) {
        throw new FactoryRunDriverApiError("not_found", `Run "${request.runId}" was not found`);
      }

      return toStatusDto({
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
      });
    }
  };
}

async function withApiErrors<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof FactoryRunDriverApiError) {
      throw error;
    }
    if (error instanceof TenantMembershipRequiredError) {
      throw new FactoryRunDriverApiError("unauthorized", error.message);
    }
    if (error instanceof FactoryPackageInstallApiError) {
      throw new FactoryRunDriverApiError("invalid_request", error.message);
    }
    if (error instanceof Error && isClientValidationError(error.message)) {
      throw new FactoryRunDriverApiError("invalid_request", error.message);
    }
    throw error;
  }
}

function isClientValidationError(message: string): boolean {
  return (
    message.includes("does not belong to workspace") ||
    message.includes("is disabled") ||
    message.includes("does not match") ||
    message.includes("is not ready") ||
    message.includes("must complete intake") ||
    message.includes("is not actively running") ||
    message.includes("does not define") ||
    message.includes("was not found in the catalog") ||
    message.includes("Unknown blueprint package key")
  );
}
