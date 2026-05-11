import { describe, expect, it, vi } from "vitest";

import { createProviderCredentialService } from "../src/secrets/provider-credential-service.js";

describe("provider credential service", () => {
  it.each([
    ["openai_api"],
    ["anthropic_api"],
    ["xai_grok_api"],
    ["openrouter_api"],
    ["generic_api"]
  ] as const)("registers %s through the vault-backed secret service and returns only public connection state", async (providerKind) => {
    const secrets = {
      registerProviderCredential: vi.fn().mockResolvedValue({
        providerKind,
        label: "Primary",
        connected: true,
        metadata: { workspaceLabel: "Team" }
      })
    };
    const service = createProviderCredentialService({ secrets: secrets as never });

    const response = await service.register({
      tenantId: "tenant-1",
      actorUserId: "user-1",
      providerKind,
      label: "Primary",
      secretValues: { apiKey: "sk-provider-secret" },
      metadata: { workspaceLabel: "Team" }
    });

    expect(response).toEqual({
      providerKind,
      label: "Primary",
      connected: true,
      metadata: { workspaceLabel: "Team" }
    });
    expect(JSON.stringify(response)).not.toMatch(/sk-provider-secret|secretRef|wf_secret_|vault/i);
    expect(secrets.registerProviderCredential).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-1",
        actorUserId: "user-1",
        label: "Primary",
        registration: expect.objectContaining({
          secretValues: { apiKey: "sk-provider-secret" }
        })
      })
    );
  });

  it("rejects active provider registrations without required secret values", async () => {
    const service = createProviderCredentialService({
      secrets: { registerProviderCredential: vi.fn() } as never
    });

    await expect(
      service.register({
        tenantId: "tenant-1",
        actorUserId: "user-1",
        providerKind: "openrouter_api",
        label: "OpenRouter",
        secretValues: {},
        metadata: {}
      })
    ).rejects.toThrow('Provider credential is missing required secret "apiKey"');
  });

  it("validates company-isolated Codex subscription metadata before creating an active credential", async () => {
    const service = createProviderCredentialService({
      secrets: { registerProviderCredential: vi.fn() } as never
    });

    await expect(
      service.register({
        tenantId: "tenant-1",
        actorUserId: "user-1",
        providerKind: "openai_chatgpt_codex_subscription",
        label: "OpenAI Codex",
        secretValues: {},
        metadata: { codexHome: "C:/shared/.codex", authStateRef: "codex-auth-state" }
      })
    ).rejects.toThrow("Codex subscription auth must use an isolated tenant auth home");
  });

  it("rejects Codex subscription registration when API-key billing is present in runtime env", async () => {
    const service = createProviderCredentialService({
      secrets: { registerProviderCredential: vi.fn() } as never,
      runtimeEnv: { OPENAI_API_KEY: "sk-operator-key" }
    });

    await expect(
      service.register({
        tenantId: "tenant-1",
        actorUserId: "user-1",
        providerKind: "openai_chatgpt_codex_subscription",
        label: "OpenAI Codex",
        secretValues: {},
        metadata: { codexHome: "C:/wf-auth/tenant-1/codex", authStateRef: "codex-auth-state" }
      })
    ).rejects.toThrow("OPENAI_API_KEY must be absent when using Codex subscription auth");
  });
});
