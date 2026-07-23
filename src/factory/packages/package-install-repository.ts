import type {
  PackageInstall,
  PackageInstallAuditIntent,
  PackageInstallAuditAction,
  PackagePermissionDiff,
  PackagePermissionSnapshot
} from "../domain/types.js";
import type { QueryClient } from "../../db/supabase-repositories.js";

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

function toIsoString(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

/**
 * Backs FactoryPackageInstallRepository with migration 0037's tables
 * (wfpc.factory_blueprint_package_installs / _install_events) over the
 * existing Supabase-vs-vanilla-agnostic QueryClient (src/db/postgres-client.ts).
 * Tenant isolation here is app-layer: every read is scoped by `tenant_id = $1`
 * in the WHERE clause, not Postgres RLS (TASK-055 AC3).
 */
export function createPostgresFactoryPackageInstallRepository(client: QueryClient): FactoryPackageInstallRepository {
  return {
    async saveLifecycleEvent(input) {
      assertAuditIntentMatchesInstall(input);
      const row = mapInstallToRow(input.install);
      const eventRow = mapAuditIntentToRow(input);

      await client.query("begin", []);
      try {
        const existingInstall = await client.query(
          "select tenant_id from wfpc.factory_blueprint_package_installs where install_id = $1",
          [row.installId]
        );
        const existingTenantId = (existingInstall.rows[0] as { tenant_id?: string } | undefined)?.tenant_id;
        if (existingTenantId !== undefined && existingTenantId !== row.tenantId) {
          throw new Error("Package install id already exists");
        }

        if (existingTenantId === undefined) {
          const conflictingInstall = await client.query(
            "select install_id from wfpc.factory_blueprint_package_installs where tenant_id = $1 and package_id = $2",
            [row.tenantId, row.packageId]
          );
          const conflictingInstallId = (conflictingInstall.rows[0] as { install_id?: string } | undefined)?.install_id;
          if (conflictingInstallId !== undefined && conflictingInstallId !== row.installId) {
            throw new Error("Tenant already has an install for this package");
          }
        }

        const existingEvent = await client.query(
          "select install_event_id from wfpc.factory_blueprint_package_install_events where install_event_id = $1",
          [eventRow.installEventId]
        );
        if (existingEvent.rows.length > 0) {
          throw new Error("Package install lifecycle event already exists");
        }

        await client.query(
          `insert into wfpc.factory_blueprint_package_installs
            (install_id, tenant_id, package_id, package_version_id, previous_package_version_id,
             install_status, permission_snapshot, permission_diff, installed_at, updated_at, disabled_at, uninstalled_at)
           values ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9,$10,$11,$12)
           on conflict (install_id) do update set
             package_version_id = excluded.package_version_id,
             previous_package_version_id = excluded.previous_package_version_id,
             install_status = excluded.install_status,
             permission_snapshot = excluded.permission_snapshot,
             permission_diff = excluded.permission_diff,
             updated_at = excluded.updated_at,
             disabled_at = excluded.disabled_at,
             uninstalled_at = excluded.uninstalled_at`,
          [
            row.installId,
            row.tenantId,
            row.packageId,
            row.packageVersionId,
            row.previousPackageVersionId,
            row.installStatus,
            JSON.stringify(row.permissionSnapshot),
            row.permissionDiff ? JSON.stringify(row.permissionDiff) : null,
            row.installedAt,
            row.updatedAt,
            row.disabledAt,
            row.uninstalledAt
          ]
        );

        await client.query(
          `insert into wfpc.factory_blueprint_package_install_events
            (install_event_id, tenant_id, package_install_id, package_id, package_version_id, event_action, occurred_at, metadata)
           values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`,
          [
            eventRow.installEventId,
            eventRow.tenantId,
            eventRow.packageInstallId,
            eventRow.packageId,
            eventRow.packageVersionId,
            eventRow.eventAction,
            eventRow.occurredAt,
            JSON.stringify(eventRow.metadata)
          ]
        );

        await client.query("commit", []);
      } catch (error) {
        await client.query("rollback", []);
        throw error;
      }
    },

    async findInstallById(input): Promise<FactoryPackageInstallRow | null> {
      const result = await client.query(
        `select install_id, tenant_id, package_id, package_version_id, previous_package_version_id,
                install_status, permission_snapshot, permission_diff, installed_at, updated_at, disabled_at, uninstalled_at
         from wfpc.factory_blueprint_package_installs
         where tenant_id = $1 and install_id = $2`,
        [input.tenantId, input.installId]
      );
      const row = result.rows[0] as Record<string, unknown> | undefined;
      if (!row) {
        return null;
      }

      return {
        installId: String(row.install_id),
        tenantId: String(row.tenant_id),
        packageId: String(row.package_id),
        packageVersionId: String(row.package_version_id),
        previousPackageVersionId: row.previous_package_version_id ? String(row.previous_package_version_id) : null,
        installStatus: row.install_status as FactoryPackageInstallRow["installStatus"],
        permissionSnapshot: row.permission_snapshot as PackagePermissionSnapshot,
        permissionDiff: (row.permission_diff as PackagePermissionDiff | null) ?? null,
        installedAt: toIsoString(row.installed_at),
        updatedAt: row.updated_at ? toIsoString(row.updated_at) : null,
        disabledAt: row.disabled_at ? toIsoString(row.disabled_at) : null,
        uninstalledAt: row.uninstalled_at ? toIsoString(row.uninstalled_at) : null
      };
    },

    async listEventsForInstall(input): Promise<FactoryPackageInstallEventRow[]> {
      const result = await client.query(
        `select install_event_id, tenant_id, package_install_id, package_id, package_version_id, event_action, occurred_at, metadata
         from wfpc.factory_blueprint_package_install_events
         where tenant_id = $1 and package_install_id = $2
         order by occurred_at asc`,
        [input.tenantId, input.installId]
      );

      return result.rows.map((raw) => {
        const row = raw as Record<string, unknown>;
        return {
          installEventId: String(row.install_event_id),
          tenantId: String(row.tenant_id),
          packageInstallId: String(row.package_install_id),
          packageId: String(row.package_id),
          packageVersionId: String(row.package_version_id),
          eventAction: row.event_action as FactoryPackageInstallEventRow["eventAction"],
          occurredAt: toIsoString(row.occurred_at),
          metadata: (row.metadata as PackageInstallAuditIntent["metadata"]) ?? {}
        };
      });
    }
  };
}
