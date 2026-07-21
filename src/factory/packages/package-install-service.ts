import type {
  BlueprintPackageDefinition,
  PackageInstall,
  PackageInstallAuditAction,
  PackageInstallAuditIntent,
  PackagePermissionDiff,
  PackagePermissionSnapshot
} from "../domain/types.js";

export interface PackageInstallTransition {
  install: PackageInstall;
  auditIntent: PackageInstallAuditIntent;
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

function isPermissionWidening(diff: PackagePermissionDiff) {
  return (
    diff.addedTools.length > 0 ||
    diff.widenedExternalActions.length > 0 ||
    diff.budgetIncreases.length > 0
  );
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
    if (
      (currentMode === "denied" || currentMode === null) &&
      nextMode === "approval_required"
    ) {
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

function assertLifecycleCanChange(install: PackageInstall) {
  if (install.status === "uninstalled") {
    throw new Error(`Blueprint install "${install.id}" is uninstalled`);
  }
}

function createAuditIntent(input: {
  action: PackageInstallAuditAction;
  install: PackageInstall;
  occurredAt: string;
  metadata?: PackageInstallAuditIntent["metadata"];
}): PackageInstallAuditIntent {
  return {
    action: input.action,
    workspaceId: input.install.workspaceId,
    packageInstallId: input.install.id,
    packageId: input.install.packageId,
    packageVersionId: input.install.packageVersionId,
    occurredAt: input.occurredAt,
    metadata: input.metadata ?? {}
  };
}

export function installBlueprintPackage(input: {
  id: string;
  workspaceId: string;
  blueprint: BlueprintPackageDefinition;
  installedAt: string;
}): PackageInstall {
  return {
    id: input.id,
    workspaceId: input.workspaceId,
    packageId: input.blueprint.packageId,
    packageVersionId: input.blueprint.packageVersionId,
    previousPackageVersionId: null,
    status: "enabled",
    installedAt: input.installedAt,
    updatedAt: null,
    disabledAt: null,
    uninstalledAt: null,
    enabled: true,
    permissionSnapshot: snapshotBlueprintPermissions(input.blueprint),
    permissionDiff: null
  };
}

export function createPackageInstalledAuditIntent(input: {
  install: PackageInstall;
  installedAt: string;
}): PackageInstallAuditIntent {
  return createAuditIntent({
    action: "package_installed",
    install: input.install,
    occurredAt: input.installedAt
  });
}

export function disableBlueprintPackageInstall(input: {
  install: PackageInstall;
  disabledAt: string;
}): PackageInstallTransition {
  assertLifecycleCanChange(input.install);

  const install: PackageInstall = {
    ...input.install,
    status: "disabled",
    enabled: false,
    disabledAt: input.disabledAt
  };

  return {
    install,
    auditIntent: createAuditIntent({
      action: "package_disabled",
      install,
      occurredAt: input.disabledAt
    })
  };
}

export function enableBlueprintPackageInstall(input: {
  install: PackageInstall;
  enabledAt: string;
}): PackageInstallTransition {
  assertLifecycleCanChange(input.install);

  const install: PackageInstall = {
    ...input.install,
    status: "enabled",
    enabled: true,
    updatedAt: input.enabledAt
  };

  return {
    install,
    auditIntent: createAuditIntent({
      action: "package_enabled",
      install,
      occurredAt: input.enabledAt
    })
  };
}

export function updateBlueprintPackageInstall(input: {
  install: PackageInstall;
  blueprint: BlueprintPackageDefinition;
  consent?: boolean;
  updatedAt: string;
}): PackageInstallTransition {
  assertLifecycleCanChange(input.install);

  if (input.install.packageId !== input.blueprint.packageId) {
    throw new Error(
      `Blueprint install "${input.install.id}" is bound to package "${input.install.packageId}", not "${input.blueprint.packageId}"`
    );
  }

  const nextSnapshot = snapshotBlueprintPermissions(input.blueprint);
  const diff = diffPermissionSnapshots(input.install.permissionSnapshot, nextSnapshot);
  if (isPermissionWidening(diff) && input.consent !== true) {
    throw new Error("Package update widens permissions and requires explicit consent");
  }

  const install: PackageInstall = {
    ...input.install,
    packageVersionId: input.blueprint.packageVersionId,
    previousPackageVersionId: input.install.packageVersionId,
    status: "enabled",
    enabled: true,
    updatedAt: input.updatedAt,
    disabledAt: null,
    permissionSnapshot: nextSnapshot,
    permissionDiff: diff
  };

  return {
    install,
    auditIntent: createAuditIntent({
      action: "package_updated",
      install,
      occurredAt: input.updatedAt,
      metadata: {
        previousPackageVersionId: input.install.packageVersionId,
        permissionDiff: diff
      }
    })
  };
}

export function rollbackBlueprintPackageInstall(input: {
  install: PackageInstall;
  blueprint: BlueprintPackageDefinition;
  rolledBackAt: string;
}): PackageInstallTransition {
  assertLifecycleCanChange(input.install);

  if (input.install.packageId !== input.blueprint.packageId) {
    throw new Error(
      `Blueprint install "${input.install.id}" is bound to package "${input.install.packageId}", not "${input.blueprint.packageId}"`
    );
  }

  if (input.install.previousPackageVersionId !== input.blueprint.packageVersionId) {
    throw new Error(
      `Blueprint install "${input.install.id}" cannot roll back to package version "${input.blueprint.packageVersionId}"`
    );
  }

  const install: PackageInstall = {
    ...input.install,
    packageVersionId: input.blueprint.packageVersionId,
    previousPackageVersionId: input.install.packageVersionId,
    status: "enabled",
    enabled: true,
    updatedAt: input.rolledBackAt,
    permissionSnapshot: snapshotBlueprintPermissions(input.blueprint),
    permissionDiff: null
  };

  return {
    install,
    auditIntent: createAuditIntent({
      action: "package_rolled_back",
      install,
      occurredAt: input.rolledBackAt,
      metadata: {
        previousPackageVersionId: input.install.packageVersionId
      }
    })
  };
}

export function uninstallBlueprintPackageInstall(input: {
  install: PackageInstall;
  uninstalledAt: string;
}): PackageInstallTransition {
  assertLifecycleCanChange(input.install);

  const install: PackageInstall = {
    ...input.install,
    status: "uninstalled",
    enabled: false,
    uninstalledAt: input.uninstalledAt
  };

  return {
    install,
    auditIntent: createAuditIntent({
      action: "package_uninstalled",
      install,
      occurredAt: input.uninstalledAt
    })
  };
}
