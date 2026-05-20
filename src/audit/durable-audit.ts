import { safeAuditMetadata } from "../secrets/redaction.js";
import type { QueryClient } from "../db/supabase-repositories.js";

export type DurableAuditEvent = {
  tenantId: string;
  actorUserId?: string;
  eventType: string;
  entityType: string;
  entityId?: string;
  metadata: Record<string, unknown>;
};

export function createDurableAuditSink(client: QueryClient) {
  return async function recordAuditEvent(event: DurableAuditEvent): Promise<void> {
    const metadata = safeAuditMetadata({
      ...event.metadata,
      ...(event.entityId && !isUuid(event.entityId) ? { externalEntityId: event.entityId } : {})
    });
    await client.query(
      `insert into wfpc.audit_events
        (tenant_id, actor_user_id, event_type, entity_type, entity_id, metadata)
       values ($1, $2::uuid, $3, $4, $5::uuid, $6::jsonb)`,
      [
        event.tenantId,
        event.actorUserId ?? null,
        event.eventType,
        event.entityType,
        event.entityId && isUuid(event.entityId) ? event.entityId : null,
        JSON.stringify(metadata)
      ]
    );
  };
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
