import type { TransactionRunner } from "../db/acid-guard-repository.js";
import { registerStorageConnectorRecord } from "../db/supabase-repositories.js";
import { createEncryptedSecretVault } from "../secrets/encrypted-vault.js";
import { createPostgresEncryptedVaultStore } from "../secrets/postgres-vault-store.js";
import type { StorageOAuthProviderKind } from "./storage-oauth-service.js";

export function createVaultBackedStorageOAuthRegistration(options: { runner: TransactionRunner; vaultMasterKey: string }) {
  return {
    async register(input: {
      tenantId: string;
      actorUserId: string;
      providerKind: StorageOAuthProviderKind;
      displayName: string;
      secretValues: Record<string, string>;
      publicTarget: Record<string, unknown>;
    }) {
      return options.runner.withTransaction(async (transaction) => {
        const vault = createEncryptedSecretVault({
          masterKey: options.vaultMasterKey,
          store: createPostgresEncryptedVaultStore(transaction)
        });
        const secretRef = await vault.store({
          tenantId: input.tenantId,
          providerKind: input.providerKind,
          secretValues: input.secretValues
        });
        return registerStorageConnectorRecord(transaction, {
          tenantId: input.tenantId,
          actorUserId: input.actorUserId,
          providerKind: input.providerKind,
          displayName: input.displayName,
          secretRefs: {
            oauthTokenRef: secretRef,
            refreshTokenRef: secretRef
          },
          publicTarget: input.publicTarget
        });
      });
    }
  };
}
