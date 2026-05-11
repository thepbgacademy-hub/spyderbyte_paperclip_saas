import { describe, expect, it, vi } from "vitest";

import { createVaultBackedProviderCredentialRegistration } from "../src/secrets/vault-backed-provider-registration.js";

describe("vault-backed provider credential registration", () => {
  it("connects tenant credential registration to vault storage and Supabase references", async () => {
    const vault = {
      store: vi.fn().mockResolvedValue("wf_secret_opaque"),
      rotate: vi.fn(),
      revoke: vi.fn(),
      access: vi.fn()
    };
    const repository = {
      create: vi.fn().mockResolvedValue("secret-reference-id"),
      updateSecretRef: vi.fn(),
      revoke: vi.fn(),
      findIdBySecretRef: vi.fn()
    };
    const registerProviderCredential = createVaultBackedProviderCredentialRegistration({
      vault,
      repository,
      audit: vi.fn()
    });

    const response = await registerProviderCredential({
      tenantId: "tenant-1",
      actorUserId: "user-1",
      providerKind: "xai_grok_api",
      label: "xAI Grok",
      secretValues: { apiKey: "sk-xai-secret" },
      metadata: { defaultModel: "grok-4" }
    });

    expect(vault.store).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      providerKind: "xai_grok_api",
      secretValues: { apiKey: "sk-xai-secret" }
    });
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-1",
        providerKind: "xai_grok_api",
        secretRef: "wf_secret_opaque"
      })
    );
    expect(response).toEqual({
      providerKind: "xai_grok_api",
      label: "xAI Grok",
      connected: true,
      metadata: { defaultModel: "grok-4" }
    });
    expect(JSON.stringify(response)).not.toMatch(/sk-xai-secret|wf_secret_opaque|secretRef/i);
  });

  it("preserves the OpenAI API provider lane instead of collapsing it into legacy OpenAI", async () => {
    const registerProviderCredential = createVaultBackedProviderCredentialRegistration({
      vault: {
        store: vi.fn().mockResolvedValue("wf_secret_openai"),
        rotate: vi.fn(),
        revoke: vi.fn(),
        access: vi.fn()
      },
      repository: {
        create: vi.fn().mockResolvedValue("secret-reference-id"),
        updateSecretRef: vi.fn(),
        revoke: vi.fn(),
        findIdBySecretRef: vi.fn()
      },
      audit: vi.fn()
    });

    await expect(
      registerProviderCredential({
        tenantId: "tenant-1",
        actorUserId: "user-1",
        providerKind: "openai_api",
        label: "OpenAI",
        secretValues: { apiKey: "sk-openai-secret" },
        metadata: { projectId: "proj_123" }
      })
    ).resolves.toMatchObject({ providerKind: "openai_api" });
  });
});
