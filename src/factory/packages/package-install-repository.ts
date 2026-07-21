import type {
  PackageInstall,
  PackageInstallAuditIntent,
  PackageInstallAuditAction,
  PackagePermissionDiff,
  PackagePermissionSnapshot
} from "../domain/types.js";

export interface FactoryPackageInstallRow {
  installId: string;
  tenantId: string;
  packageId: string;
  packageVersionId: string;
  previousPackageVersionId: string | null;
  installStatus: PackageInstall["status"];
  permissionSnapshot: PackagePermissionSnapshot;
  permissionDiff: PackagePermissionDiff | null;
  installedAt: string;
  updatedAt: string | null;
  disabledAt: string | null;
  uninstalledAt: string | null;
}

export interface FactoryPackageInstallEventRow {
  installEventId: string;
  tenantId: string;
  packageInstallId: string;
  packageId: string;
  packageVersionId: string;
  eventAction: PackageInstallAuditAction;
  occurredAt: string;
  metadata: PackageInstallAuditIntent["metadata"];
}

export interface FactoryPackageInstallRepository {
  saveLifecycleEvent(input: {
    install: PackageInstall;
    auditIntent: PackageInstallAuditIntent;
  }): Promise<void>;
  findInstallById(input: { tenantId: string; installId: string }): Promise<FactoryPackageInstallRow | null>;
  listEventsForInstall(input: { tenantId: string; installId: string }): Promise<FactoryPackageInstallEventRow[]>;
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function mapInstallToRow(install: PackageInstall): FactoryPackageInstallRow {
  return {
    installId: install.id,
    tenantId: install.workspaceId,
    packageId: install.packageId,
    packageVersionId: install.packageVersionId,
    previousPackageVersionId: install.previousPackageVersionId,
    installStatus: install.status,
    permissionSnapshot: cloneJson(install.permissionSnapshot),
    permissionDiff: cloneJson(install.permissionDiff),
    installedAt: install.installedAt,
    updatedAt: install.updatedAt,
    disabledAt: install.disabledAt,
    uninstalledAt: install.uninstalledAt
  };
}

function assertAuditIntentMatchesInstall(input: {
  install: PackageInstall;
  auditIntent: PackageInstallAuditIntent;
}) {
  const { install, auditIntent } = input;
  if (
    auditIntent.workspaceId !== install.workspaceId ||
    auditIntent.packageInstallId !== install.id ||
    auditIntent.packageId !== install.packageId ||
    auditIntent.packageVersionId !== install.packageVersionId
  ) {
    throw new Error("Package install audit intent does not match install identity");
  }
}

function mapAuditIntentToRow(input: {
  install: PackageInstall;
  auditIntent: PackageInstallAuditIntent;
}): FactoryPackageInstallEventRow {
  const { install, auditIntent } = input;
  return {
    installEventId: `${auditIntent.packageInstallId}:${auditIntent.action}:${auditIntent.occurredAt}`,
    tenantId: install.workspaceId,
    packageInstallId: auditIntent.packageInstallId,
    packageId: auditIntent.packageId,
    packageVersionId: auditIntent.packageVersionId,
    eventAction: auditIntent.action,
    occurredAt: auditIntent.occurredAt,
    metadata: cloneJson(auditIntent.metadata)
  };
}

export function createInMemoryFactoryPackageInstallRepository(): FactoryPackageInstallRepository {
  const installs = new Map<string, FactoryPackageInstallRow>();
  const installIdsByTenantPackage = new Map<string, string>();
  const eventIds = new Set<string>();
  const events: FactoryPackageInstallEventRow[] = [];

  return {
    async saveLifecycleEvent(input) {
      assertAuditIntentMatchesInstall(input);
      const tenantPackageKey = `${input.install.workspaceId}:${input.install.packageId}`;
      const existingInstallId = installIdsByTenantPackage.get(tenantPackageKey);
      if (existingInstallId && existingInstallId !== input.install.id) {
        throw new Error("Tenant already has an install for this package");
      }
      const existingInstall = installs.get(input.install.id);
      if (existingInstall && existingInstall.tenantId !== input.install.workspaceId) {
        throw new Error("Package install id already exists");
      }
      const event = mapAuditIntentToRow(input);
      if (eventIds.has(event.installEventId)) {
        throw new Error("Package install lifecycle event already exists");
      }

      installs.set(input.install.id, mapInstallToRow(input.install));
      installIdsByTenantPackage.set(tenantPackageKey, input.install.id);
      eventIds.add(event.installEventId);
      events.push(event);
    },

    async findInstallById(input) {
      const install = installs.get(input.installId);
      if (install?.tenantId !== input.tenantId) {
        return null;
      }
      return install ? cloneJson(install) : null;
    },

    async listEventsForInstall(input) {
      return events
        .filter((event) => event.tenantId === input.tenantId && event.packageInstallId === input.installId)
        .map((event) => cloneJson(event));
    }
  };
}
