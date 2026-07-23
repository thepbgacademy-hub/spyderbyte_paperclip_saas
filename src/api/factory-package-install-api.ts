import type {
  BlueprintPackageDefinition,
  PackageInstall,
  PackagePermissionDiff,
  PackagePermissionSnapshot
} from "../factory/domain/types.js";
import {
  disableBlueprintPackageForTenant,
  enableBlueprintPackageForTenant,
  installBlueprintPackageForTenant,
  rollbackBlueprintPackageForTenant,
  uninstallBlueprintPackageForTenant,
  updateBlueprintPackageForTenant,
  type PackageInstallEntitlements,
  type TenantPackageInstallRole
} from "../factory/packages/package-install-application-service.js";
import type { FactoryPackageInstallRepository } from "../factory/packages/package-install-repository.js";
import type { FactoryPackageInstallAuditSink } from "./factory-package-install-audit.js";

export type FactoryPackageInstallApiSession = {
  userId: string;
  tenantId: string;
};

export class FactoryPackageInstallApiError extends Error {
  constructor(readonly code: "unauthorized" | "forbidden" | "invalid_request", message: string) {
    super(message);
    this.name = "FactoryPackageInstallApiError";
  }
}

export class FactoryPackageInstallPermissionConsentError extends Error {
  readonly code = "permission_widening_requires_consent";

  constructor(readonly permissionDiff: FactoryPackageInstallPermissionDiffDto) {
    super("Package update widens permissions and requires explicit consent");
    this.name = "FactoryPackageInstallPermissionConsentError";
  }
}

export type FactoryPackageInstallPermissionDiffDto = PackagePermissionDiff & {
  widened: boolean;
};

export type FactoryPackageInstallDto = {
  installId: string;
  workspaceId: string;
  packageId: string;
  packageVersionId: string;
  previousPackageVersionId: string | null;
  status: PackageInstall["status"];
  enabled: boolean;
  installedAt: string;
  updatedAt: string | null;
  disabledAt: string | null;
  uninstalledAt: string | null;
  permissionDiff: FactoryPackageInstallPermissionDiffDto | null;
  deliverablesDeleted?: false;
  launchKitDeleted?: false;
};

export type FactoryPackageInstallApiDeps = {
  authenticate(input: { authorization: string; cookie?: string }): Promise<FactoryPackageInstallApiSession | null>;
  requireTenantMember(input: { tenantId: string; userId: string }): Promise<void>;
  resolveTenantPackageInstallRole(input: {
    tenantId: string;
    userId: string;
  }): Promise<TenantPackageInstallRole>;
  loadBlueprintPackage(input: {
    packageKey: string;
    packageVersionId?: string;
  }): Promise<BlueprintPackageDefinition>;
  entitlements: PackageInstallEntitlements;
  repository: FactoryPackageInstallRepository;
  auditSink: FactoryPackageInstallAuditSink;
};

type AuthenticatedRequest = {
  authorization: string;
  cookie?: string;
};

export function createFactoryPackageInstallApi(deps: FactoryPackageInstallApiDeps) {
  async function createActor(request: AuthenticatedRequest) {
    const session = await deps.authenticate({
      authorization: request.authorization,
      ...(request.cookie ? { cookie: request.cookie } : {})
    });
    if (!session) {
      throw new FactoryPackageInstallApiError("unauthorized", "Unauthorized");
    }

    await deps.requireTenantMember({
      tenantId: session.tenantId,
      userId: session.userId
    });
    const role = await deps.resolveTenantPackageInstallRole({
      tenantId: session.tenantId,
      userId: session.userId
    });

    return {
      userId: session.userId,
      tenantId: session.tenantId,
      role
    };
  }

  return {
    async installPackage(
      request: AuthenticatedRequest & {
        packageKey: string;
        installId: string;
        installedAt: string;
      }
    ): Promise<FactoryPackageInstallDto> {
      const actor = await createActor(request);
      const blueprint = await deps.loadBlueprintPackage({
        packageKey: request.packageKey
      });

      const install = await withApiErrors(() =>
        installBlueprintPackageForTenant({
          actor,
          blueprint,
          packageKey: request.packageKey,
          installId: request.installId,
          installedAt: request.installedAt,
          repository: deps.repository,
          entitlements: deps.entitlements
        })
      );

      await deps.auditSink({
        tenantId: actor.tenantId,
        actorUserId: actor.userId,
        installId: install.id,
        packageKey: request.packageKey
      });

      return toInstallDto(install);
    },

    async disablePackage(
      request: AuthenticatedRequest & {
        installId: string;
        disabledAt: string;
      }
    ): Promise<FactoryPackageInstallDto> {
      const actor = await createActor(request);
      return withApiErrors(async () =>
        toInstallDto(
          await disableBlueprintPackageForTenant({
            actor,
            installId: request.installId,
            disabledAt: request.disabledAt,
            repository: deps.repository
          })
        )
      );
    },

    async enablePackage(
      request: AuthenticatedRequest & {
        installId: string;
        enabledAt: string;
      }
    ): Promise<FactoryPackageInstallDto> {
      const actor = await createActor(request);
      return withApiErrors(async () =>
        toInstallDto(
          await enableBlueprintPackageForTenant({
            actor,
            installId: request.installId,
            enabledAt: request.enabledAt,
            repository: deps.repository
          })
        )
      );
    },

    async updatePackage(
      request: AuthenticatedRequest & {
        packageKey: string;
        installId: string;
        packageVersionId: string;
        consent?: boolean;
        updatedAt: string;
      }
    ): Promise<FactoryPackageInstallDto> {
      const actor = await createActor(request);
      const blueprint = await deps.loadBlueprintPackage({
        packageKey: request.packageKey,
        packageVersionId: request.packageVersionId
      });

      try {
        return await withApiErrors(async () =>
          toInstallDto(
            await updateBlueprintPackageForTenant({
              actor,
              blueprint,
              packageKey: request.packageKey,
              installId: request.installId,
              ...(request.consent === undefined ? {} : { consent: request.consent }),
              updatedAt: request.updatedAt,
              repository: deps.repository
            })
          )
        );
      } catch (error) {
        if (
          error instanceof Error &&
          error.message === "Package update widens permissions and requires explicit consent"
        ) {
          const currentInstall = await deps.repository.findInstallById({
            tenantId: actor.tenantId,
            installId: request.installId
          });
          if (!currentInstall) {
            throw error;
          }
          throw new FactoryPackageInstallPermissionConsentError(
            toPermissionDiffDto(diffPermissionSnapshots(currentInstall.permissionSnapshot, snapshotBlueprintPermissions(blueprint)))
          );
        }
        throw error;
      }
    },

    async rollbackPackage(
      request: AuthenticatedRequest & {
        packageKey: string;
        installId: string;
        packageVersionId: string;
        rolledBackAt: string;
      }
    ): Promise<FactoryPackageInstallDto> {
      const actor = await createActor(request);
      const blueprint = await deps.loadBlueprintPackage({
        packageKey: request.packageKey,
        packageVersionId: request.packageVersionId
      });

      return withApiErrors(async () =>
        toInstallDto(
          await rollbackBlueprintPackageForTenant({
            actor,
            blueprint,
            packageKey: request.packageKey,
            installId: request.installId,
            rolledBackAt: request.rolledBackAt,
            repository: deps.repository
          })
        )
      );
    },

    async uninstallPackage(
      request: AuthenticatedRequest & {
        packageId: string;
        packageKey: string;
        installId: string;
        confirmation: string;
        uninstalledAt: string;
      }
    ): Promise<FactoryPackageInstallDto> {
      const actor = await createActor(request);

      return withApiErrors(async () =>
        toInstallDto(
          await uninstallBlueprintPackageForTenant({
            actor,
            packageId: request.packageId,
            packageKey: request.packageKey,
            installId: request.installId,
            confirmation: request.confirmation,
            uninstalledAt: request.uninstalledAt,
            repository: deps.repository
          }),
          { includeNonDestructiveUninstallFlags: true }
        )
      );
    }
  };
}

async function withApiErrors<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof FactoryPackageInstallApiError || error instanceof FactoryPackageInstallPermissionConsentError) {
      throw error;
    }
    if (
      error instanceof Error &&
      (error.message.includes("Only tenant owners and admins") || error.message.includes("is not entitled"))
    ) {
      throw new FactoryPackageInstallApiError("forbidden", error.message);
    }
    if (error instanceof Error && isClientValidationError(error.message)) {
      throw new FactoryPackageInstallApiError("invalid_request", error.message);
    }
    throw error;
  }
}

function isClientValidationError(message: string): boolean {
  return (
    message.includes("does not match requested package") ||
    message.includes("was not found for tenant") ||
    message.includes("must be enabled before") ||
    message.includes("is already on package version") ||
    message.includes("is bound to package") ||
    message.includes("Uninstall confirmation must exactly match") ||
    message.includes("is uninstalled")
  );
}

function toInstallDto(
  install: PackageInstall,
  options: { includeNonDestructiveUninstallFlags?: boolean } = {}
): FactoryPackageInstallDto {
  return {
    installId: install.id,
    workspaceId: install.workspaceId,
    packageId: install.packageId,
    packageVersionId: install.packageVersionId,
    previousPackageVersionId: install.previousPackageVersionId,
    status: install.status,
    enabled: install.enabled,
    installedAt: install.installedAt,
    updatedAt: install.updatedAt,
    disabledAt: install.disabledAt,
    uninstalledAt: install.uninstalledAt,
    permissionDiff: install.permissionDiff ? toPermissionDiffDto(install.permissionDiff) : null,
    ...(options.includeNonDestructiveUninstallFlags
      ? {
          deliverablesDeleted: false,
          launchKitDeleted: false
        }
      : {})
  };
}

function snapshotBlueprintPermissions(blueprint: BlueprintPackageDefinition): PackagePermissionSnapshot {
  return {
    permissions: {
      tools: [...blueprint.permissions.tools],
      externalActions: { ...blueprint.permissions.externalActions },
      dataAccess: { ...blueprint.permissions.dataAccess }
    },
    budgets: { ...blueprint.budgets }
  };
}

function createEmptyPermissionDiff(): PackagePermissionDiff {
  return {
    addedTools: [],
    widenedExternalActions: [],
    budgetIncreases: []
  };
}

function diffPermissionSnapshots(
  current: PackagePermissionSnapshot,
  next: PackagePermissionSnapshot
): PackagePermissionDiff {
  const diff = createEmptyPermissionDiff();
  const currentTools = new Set(current.permissions.tools);

  for (const tool of next.permissions.tools) {
    if (!currentTools.has(tool)) {
      diff.addedTools.push(tool);
    }
  }

  for (const [action, nextMode] of Object.entries(next.permissions.externalActions)) {
    const currentMode = current.permissions.externalActions[action] ?? null;
    if ((currentMode === "denied" || currentMode === null) && nextMode === "approval_required") {
      diff.widenedExternalActions.push({
        action,
        from: currentMode,
        to: nextMode
      });
    }
  }

  for (const key of Object.keys(next.budgets) as Array<keyof PackagePermissionSnapshot["budgets"]>) {
    if (next.budgets[key] > current.budgets[key]) {
      diff.budgetIncreases.push({
        budget: key,
        from: current.budgets[key],
        to: next.budgets[key]
      });
    }
  }

  return diff;
}

function toPermissionDiffDto(diff: PackagePermissionDiff): FactoryPackageInstallPermissionDiffDto {
  return {
    ...diff,
    widened:
      diff.addedTools.length > 0 ||
      diff.widenedExternalActions.length > 0 ||
      diff.budgetIncreases.length > 0
  };
}
