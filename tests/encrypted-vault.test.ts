import { describe, expect, it } from "vitest";

import { createEncryptedSecretVault, createMemoryEncryptedVaultStore } from "../src/secrets/encrypted-vault.js";

describe("encrypted secret vault", () => {
  it("stores encrypted provider secrets behind opaque references", async () => {
    const store = createMemoryEncryptedVaultStore();
    const vault = createEncryptedSecretVault({ masterKey: "test-master-key-with-enough-length", store });

    const secretRef = await vault.store({
      tenantId: "tenant-1",
      providerKind: "openai_api",
      secretValues: { apiKey: "sk-openai-secret" }
    });

    expect(secretRef).toMatch(/^wf_secret_/);
    expect(JSON.stringify(store.dump())).not.toContain("sk-openai-secret");
    await expect(vault.access({ tenantId: "tenant-1", secretRef, runId: "run-1" })).resolves.toEqual({ apiKey: "sk-openai-secret" });
  });

  it("enforces tenant ownership when accessing and rotating secrets", async () => {
    const store = createMemoryEncryptedVaultStore();
    const vault = createEncryptedSecretVault({ masterKey: "test-master-key-with-enough-length", store });
    const secretRef = await vault.store({
      tenantId: "tenant-1",
      providerKind: "anthropic_api",
      secretValues: { apiKey: "sk-ant-secret" }
    });

    await expect(vault.access({ tenantId: "tenant-2", secretRef, runId: "run-1" })).rejects.toMatchObject({
      code: "vault_secret_not_found",
      publicMessage: "credential_invalid"
    });

    await expect(vault.rotate({ tenantId: "tenant-2", secretRef, nextSecretValues: { apiKey: "sk-next" } })).rejects.toMatchObject({
      code: "vault_secret_not_found"
    });
  });

  it("deletes the previous encrypted handle after rotation", async () => {
    const store = createMemoryEncryptedVaultStore();
    const vault = createEncryptedSecretVault({ masterKey: "test-master-key-with-enough-length", store });
    const secretRef = await vault.store({
      tenantId: "tenant-1",
      providerKind: "openrouter_api",
      secretValues: { apiKey: "sk-original" }
    });

    const nextSecretRef = await vault.rotate({ tenantId: "tenant-1", secretRef, nextSecretValues: { apiKey: "sk-next" } });

    await expect(vault.access({ tenantId: "tenant-1", secretRef, runId: "run-1" })).rejects.toMatchObject({
      code: "vault_secret_not_found"
    });
    await expect(vault.access({ tenantId: "tenant-1", secretRef: nextSecretRef, runId: "run-2" })).resolves.toEqual({ apiKey: "sk-next" });
  });
});
