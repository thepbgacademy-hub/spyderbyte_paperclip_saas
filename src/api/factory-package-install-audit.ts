import { createDurableAuditSink } from "../audit/durable-audit.js";
import type { QueryClient } from "../db/supabase-repositories.js";

export type FactoryPackageInstallAuditSink = (event: {
  tenantId: string;
  actorUserId: string;
  installId: string;
  packageKey: string;
}) => Promise<void>;

/**
 * Composes the durable audit sink (src/audit/durable-audit.ts) into the
 * install path's narrower audit event shape. This is the only place a
 * concrete Postgres adapter is wired in -- the API layer, not the pure
 * application service (CON-002).
 */
export function createDurableFactoryPackageInstallAuditSink(client: QueryClient): FactoryPackageInstallAuditSink {
  const recordAuditEvent = createDurableAuditSink(client);
  return async function recordFactoryPackageInstallAuditEvent(event) {
    await recordAuditEvent({
      tenantId: event.tenantId,
      actorUserId: event.actorUserId,
      eventType: "factory.package.installed",
      entityType: "factory_blueprint_package_install",
      entityId: event.installId,
      metadata: { packageKey: event.packageKey }
    });
  };
}
