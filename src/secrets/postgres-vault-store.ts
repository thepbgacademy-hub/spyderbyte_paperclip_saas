import type { QueryClient } from "../db/supabase-repositories.js";
import type { EncryptedVaultStore } from "./encrypted-vault.js";

export function createPostgresEncryptedVaultStore(client: QueryClient): EncryptedVaultStore {
  return {
    async put(input) {
      await client.query(
        `insert into wfpc_private.vault_secrets
          (secret_ref, tenant_id, provider_kind, ciphertext, iv, tag)
         values ($1, $2, $3::wfpc.provider_kind, $4, $5, $6)
         on conflict (secret_ref) do update
         set ciphertext = excluded.ciphertext,
             iv = excluded.iv,
             tag = excluded.tag,
             updated_at = now()`,
        [
          input.secretRef,
          input.record.tenantId,
          input.record.providerKind,
          input.record.ciphertext,
          input.record.iv,
          input.record.tag
        ]
      );
    },

    async get(input) {
      const result = await client.query(
        `select tenant_id, provider_kind, ciphertext, iv, tag, created_at
         from wfpc_private.vault_secrets
         where secret_ref = $1
         limit 1`,
        [input.secretRef]
      );
      const row = result.rows[0];
      if (!row || typeof row !== "object") {
        return null;
      }
      const record = row as Record<string, unknown>;
      return {
        tenantId: String(record.tenant_id),
        providerKind: String(record.provider_kind) as never,
        ciphertext: String(record.ciphertext),
        iv: String(record.iv),
        tag: String(record.tag),
        createdAt: String(record.created_at)
      };
    },

    async delete(input) {
      await client.query("delete from wfpc_private.vault_secrets where secret_ref = $1", [input.secretRef]);
    }
  };
}
