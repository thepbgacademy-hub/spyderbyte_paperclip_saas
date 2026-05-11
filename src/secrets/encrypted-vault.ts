import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";

import type { ProviderKind } from "../providers/provider-types.js";

type EncryptedVaultRecord = {
  tenantId: string;
  providerKind: ProviderKind;
  ciphertext: string;
  iv: string;
  tag: string;
  createdAt: string;
};

export type EncryptedVaultStore = {
  put(input: { secretRef: string; record: EncryptedVaultRecord }): Promise<void>;
  get(input: { secretRef: string }): Promise<EncryptedVaultRecord | null>;
  delete(input: { secretRef: string }): Promise<void>;
};

export class VaultSecretNotFoundError extends Error {
  readonly code = "vault_secret_not_found";
  readonly publicMessage = "credential_invalid";

  constructor() {
    super("Vault secret was not found");
    this.name = "VaultSecretNotFoundError";
  }
}

export function createEncryptedSecretVault(options: { masterKey: string; store: EncryptedVaultStore }) {
  const key = deriveKey(options.masterKey);

  async function writeSecret(input: { tenantId: string; providerKind: ProviderKind; secretValues: Record<string, string>; secretRef?: string }) {
    const secretRef = input.secretRef ?? `wf_secret_${randomUUID()}`;
    const encrypted = encryptJson(key, input.secretValues);
    await options.store.put({
      secretRef,
      record: {
        tenantId: input.tenantId,
        providerKind: input.providerKind,
        ciphertext: encrypted.ciphertext,
        iv: encrypted.iv,
        tag: encrypted.tag,
        createdAt: new Date().toISOString()
      }
    });
    return secretRef;
  }

  return {
    store(input: { tenantId: string; providerKind: ProviderKind; secretValues: Record<string, string> }) {
      return writeSecret(input);
    },

    async rotate(input: { tenantId: string; secretRef: string; nextSecretValues: Record<string, string> }) {
      const current = await options.store.get({ secretRef: input.secretRef });
      if (!current || current.tenantId !== input.tenantId) {
        throw new VaultSecretNotFoundError();
      }

      const nextSecretRef = await writeSecret({
        tenantId: input.tenantId,
        providerKind: current.providerKind,
        secretValues: input.nextSecretValues
      });
      await options.store.delete({ secretRef: input.secretRef });
      return nextSecretRef;
    },

    async revoke(input: { tenantId: string; secretRef: string }) {
      const current = await options.store.get({ secretRef: input.secretRef });
      if (current && current.tenantId === input.tenantId) {
        await options.store.delete({ secretRef: input.secretRef });
      }
    },

    async access(input: { tenantId: string; secretRef: string; runId: string }) {
      const current = await options.store.get({ secretRef: input.secretRef });
      if (!current || current.tenantId !== input.tenantId) {
        throw new VaultSecretNotFoundError();
      }

      return decryptJson(key, current);
    }
  };
}

export function createMemoryEncryptedVaultStore(): EncryptedVaultStore & { dump(): Record<string, EncryptedVaultRecord> } {
  const records = new Map<string, EncryptedVaultRecord>();
  return {
    async put(input) {
      records.set(input.secretRef, input.record);
    },
    async get(input) {
      return records.get(input.secretRef) ?? null;
    },
    async delete(input) {
      records.delete(input.secretRef);
    },
    dump() {
      return Object.fromEntries(records.entries());
    }
  };
}

function deriveKey(masterKey: string): Buffer {
  if (masterKey.trim().length < 24) {
    throw new Error("Vault master key must be at least 24 characters");
  }
  return createHash("sha256").update(masterKey).digest();
}

function encryptJson(key: Buffer, value: Record<string, string>) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64")
  };
}

function decryptJson(key: Buffer, record: Pick<EncryptedVaultRecord, "ciphertext" | "iv" | "tag">): Record<string, string> {
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(record.iv, "base64"));
  decipher.setAuthTag(Buffer.from(record.tag, "base64"));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(record.ciphertext, "base64")), decipher.final()]).toString("utf8")) as Record<string, string>;
}
