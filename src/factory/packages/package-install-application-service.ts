import type { BlueprintPackageDefinition, PackageInstall } from "../domain/types.js";
import {
  createPackageInstalledAuditIntent,
  disableBlueprintPackageInstall,
  enableBlueprintPackageInstall,
  installBlueprintPackage,
  rollbackBlueprintPackageInstall,
  uninstallBlueprintPackageInstall,
  updateBlueprintPackageInstall
} from "./package-install-service.js";
import type {
  FactoryPackageInstallRepository,
  FactoryPackageInstallRow
} from "./package-install-repository.js";

export type TenantPackageInstallRole = "owner" | "admin" | "member";

export interface TenantPackageInstallActor {
  userId: string;
  tenantId: string;
  role: TenantPackageInstallRole;
}

export interface PackageInstallEntitlements {
  canInstall(input: {
    tenantId: string;
    packageKey: string;
    packageVersionId: string;
  }): Promise<boolean>;
}

export const allowAllPackageInstallEntitlements: PackageInstallEntitlements = {
  async canInstall() {
    return true;
  }
};

function assertCanManagePackageInstalls(actor: TenantPackageInstallActor, message?: string) {
  if (actor.role !== "owner" && actor.role !== "admin") {
    throw new Error(message ?? "Only tenant owners and admins can manage blueprint package installs");
  }
}

function assertExactUninstallConfirmation(input: { packageKey: string; confirmation: string }) {
  const expectedConfirmation = `UNINSTALL ${input.packageKey}`;
  if (input.confirmation !== expectedConfirmation) {
    throw new Error(`Uninstall confirmation must exactly match "${expectedConfirmation}"`);
  }
}

function mapInstallRowToDomain(row: FactoryPackageInstallRow): PackageInstall {
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

async function findTenantPackageInstall(input: {
  actor: TenantPackageInstallActor;
  installId: string;
  repository: FactoryPackageInstallRepository;
}): Promise<PackageInstall> {
  const row = await input.repository.findInstallById({
    tenantId: input.actor.tenantId,
    installId: input.installId
  });
  if (!row) {
    throw new Error(
      `Blueprint package install "${input.installId}" was not found for tenant "${input.actor.tenantId}"`
    );
  }

  return mapInstallRowToDomain(row);
}

export async function installBlueprintPackageForTenant(input: {
  actor: TenantPackageInstallActor;
  blueprint: BlueprintPackageDefinition;
  packageKey: string;
  installId: string;
  installedAt: string;
  repository: FactoryPackageInstallRepository;
  entitlements?: PackageInstallEntitlements;
}): Promise<PackageInstall> {
  assertCanManagePackageInstalls(input.actor, "Only tenant owners and admins can install blueprint packages");

  if (input.packageKey !== input.blueprint.key) {
    throw new Error(
      `Blueprint package key "${input.blueprint.key}" does not match requested package "${input.packageKey}"`
    );
  }

  const entitlements = input.entitlements ?? allowAllPackageInstallEntitlements;
  const isEntitled = await entitlements.canInstall({
    tenantId: input.actor.tenantId,
    packageKey: input.packageKey,
    packageVersionId: input.blueprint.packageVersionId
  });
  if (!isEntitled) {
    throw new Error(`Tenant "${input.actor.tenantId}" is not entitled to install package "${input.packageKey}"`);
  }

  const install = installBlueprintPackage({
    id: input.installId,
    workspaceId: input.actor.tenantId,
    blueprint: input.blueprint,
    installedAt: input.installedAt
  });
  await input.repository.saveLifecycleEvent({
    install,
    auditIntent: createPackageInstalledAuditIntent({
      install,
      installedAt: input.installedAt
    })
  });

  return install;
}

export async function disableBlueprintPackageForTenant(input: {
  actor: TenantPackageInstallActor;
  installId: string;
  disabledAt: string;
  repository: FactoryPackageInstallRepository;
}): Promise<PackageInstall> {
  assertCanManagePackageInstalls(input.actor);

  const currentInstall = await findTenantPackageInstall({
    actor: input.actor,
    installId: input.installId,
    repository: input.repository
  });
  const transition = disableBlueprintPackageInstall({
    install: currentInstall,
    disabledAt: input.disabledAt
  });
  await input.repository.saveLifecycleEvent(transition);

  return transition.install;
}

export async function enableBlueprintPackageForTenant(input: {
  actor: TenantPackageInstallActor;
  installId: string;
  enabledAt: string;
  repository: FactoryPackageInstallRepository;
}): Promise<PackageInstall> {
  assertCanManagePackageInstalls(input.actor);

  const currentInstall = await findTenantPackageInstall({
    actor: input.actor,
    installId: input.installId,
    repository: input.repository
  });
  const transition = enableBlueprintPackageInstall({
    install: currentInstall,
    enabledAt: input.enabledAt
  });
  await input.repository.saveLifecycleEvent(transition);

  return transition.install;
}

export async function updateBlueprintPackageForTenant(input: {
  actor: TenantPackageInstallActor;
  blueprint: BlueprintPackageDefinition;
  packageKey: string;
  installId: string;
  consent?: boolean;
  updatedAt: string;
  repository: FactoryPackageInstallRepository;
}): Promise<PackageInstall> {
  assertCanManagePackageInstalls(input.actor);

  if (input.packageKey !== input.blueprint.key) {
    throw new Error(
      `Blueprint package key "${input.blueprint.key}" does not match requested package "${input.packageKey}"`
    );
  }

  const currentInstall = await findTenantPackageInstall({
    actor: input.actor,
    installId: input.installId,
    repository: input.repository
  });
  if (currentInstall.status !== "enabled") {
    throw new Error(`Blueprint package install "${input.installId}" must be enabled before it can be updated`);
  }
  if (currentInstall.packageVersionId === input.blueprint.packageVersionId) {
    throw new Error(
      `Blueprint package install "${input.installId}" is already on package version "${input.blueprint.packageVersionId}"`
    );
  }

  const transition = updateBlueprintPackageInstall({
    install: currentInstall,
    blueprint: input.blueprint,
    ...(input.consent === undefined ? {} : { consent: input.consent }),
    updatedAt: input.updatedAt
  });
  await input.repository.saveLifecycleEvent(transition);

  return transition.install;
}

export async function rollbackBlueprintPackageForTenant(input: {
  actor: TenantPackageInstallActor;
  blueprint: BlueprintPackageDefinition;
  packageKey: string;
  installId: string;
  rolledBackAt: string;
  repository: FactoryPackageInstallRepository;
}): Promise<PackageInstall> {
  assertCanManagePackageInstalls(input.actor);

  if (input.packageKey !== input.blueprint.key) {
    throw new Error(
      `Blueprint package key "${input.blueprint.key}" does not match requested package "${input.packageKey}"`
    );
  }

  const currentInstall = await findTenantPackageInstall({
    actor: input.actor,
    installId: input.installId,
    repository: input.repository
  });
  if (currentInstall.status !== "enabled") {
    throw new Error(`Blueprint package install "${input.installId}" must be enabled before it can be rolled back`);
  }

  const transition = rollbackBlueprintPackageInstall({
    install: currentInstall,
    blueprint: input.blueprint,
    rolledBackAt: input.rolledBackAt
  });
  await input.repository.saveLifecycleEvent(transition);

  return transition.install;
}

export async function uninstallBlueprintPackageForTenant(input: {
  actor: TenantPackageInstallActor;
  packageId: string;
  packageKey: string;
  installId: string;
  confirmation: string;
  uninstalledAt: string;
  repository: FactoryPackageInstallRepository;
}): Promise<PackageInstall> {
  assertCanManagePackageInstalls(input.actor);

  const currentInstall = await findTenantPackageInstall({
    actor: input.actor,
    installId: input.installId,
    repository: input.repository
  });
  if (currentInstall.packageId !== input.packageId) {
    throw new Error(
      `Blueprint package install "${input.installId}" is bound to package "${currentInstall.packageId}", not "${input.packageId}"`
    );
  }
  assertExactUninstallConfirmation({
    packageKey: input.packageKey,
    confirmation: input.confirmation
  });

  const transition = uninstallBlueprintPackageInstall({
    install: currentInstall,
    uninstalledAt: input.uninstalledAt
  });
  await input.repository.saveLifecycleEvent(transition);

  return transition.install;
}
