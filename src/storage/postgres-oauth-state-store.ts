import type { QueryClient } from "../db/supabase-repositories.js";
import type { StorageOAuthProviderKind } from "./storage-oauth-service.js";

export type PendingOAuthStateRecord = {
  tenantId: string;
  actorUserId: string;
  providerKind: StorageOAuthProviderKind;
  displayName: string;
  publicTarget: Record<string, unknown>;
  codeVerifier: string;
  expiresAt: string;
};

export function createPostgresOAuthStateStore(client: QueryClient) {
  async function purgeExpired(): Promise<void> {
    await client.query("delete from wfpc_private.oauth_pending_states where expires_at <= now()", []);
  }

  return {
    async save(input: { state: string; value: PendingOAuthStateRecord }): Promise<void> {
      await purgeExpired();
      await client.query(
        `insert into wfpc_private.oauth_pending_states
          (state, tenant_id, actor_user_id, provider_kind, display_name, public_target, code_verifier, expires_at)
         values ($1, $2, $3, $4, $5, $6::jsonb, $7, $8::timestamptz)
         on conflict (state) do update
         set tenant_id = excluded.tenant_id,
             actor_user_id = excluded.actor_user_id,
             provider_kind = excluded.provider_kind,
             display_name = excluded.display_name,
             public_target = excluded.public_target,
             code_verifier = excluded.code_verifier,
             expires_at = excluded.expires_at,
             updated_at = now()`,
        [
          input.state,
          input.value.tenantId,
          input.value.actorUserId,
          input.value.providerKind,
          input.value.displayName,
          JSON.stringify(input.value.publicTarget),
          input.value.codeVerifier,
          input.value.expiresAt
        ]
      );
    },

    async consume(input: { state: string }): Promise<PendingOAuthStateRecord | null> {
      await purgeExpired();
      const result = await client.query(
        `delete from wfpc_private.oauth_pending_states
         where state = $1
         returning tenant_id, actor_user_id, provider_kind, display_name, public_target, code_verifier, expires_at`,
        [input.state]
      );
      const row = asRecord(result.rows[0]);
      if (!row.tenant_id) {
        return null;
      }

      return {
        tenantId: String(row.tenant_id),
        actorUserId: String(row.actor_user_id),
        providerKind: String(row.provider_kind) as StorageOAuthProviderKind,
        displayName: String(row.display_name),
        publicTarget: asObject(row.public_target),
        codeVerifier: String(row.code_verifier),
        expiresAt: String(row.expires_at)
      };
    }
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}
