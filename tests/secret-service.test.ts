import { describe, expect, it, vi } from "vitest";

import { OPENAI_PROVIDER } from "../src/providers/provider-types.js";
import { createGenericProviderRegistration } from "../src/providers/generic-provider.js";
import { createOpenAIProviderRegistration } from "../src/providers/openai-provider.js";
import { createSecretService } from "../src/secrets/secret-service.js";

describe("provider registrations", () => {
  it("creates OpenAI BYOK registration with optional project metadata", () => {
    expect(createOpenAIProviderRegistration({ apiKey: "sk-openai", projectId: "proj_123" })).toEqual({
      provider: OPENAI_PROVIDER,
      secretValues: { apiKey: "sk-openai" },
      metadata: { projectId: "proj_123" }
    });
  });

  it("creates generic provider registrations with public-safe metadata only", () => {
    expect(() =>
      createGenericProviderRegistration({
        label: "Example",
        secrets: { apiKey: "secret" },
        metadata: { authorizationToken: "bad" }
      })
    ).toThrow(/looks secret-like/);

    expect(() =>
      createGenericProviderRegistration({
        label: "Example",
        secrets: { apiKey: "secret" },
        metadata: { baseUrl: "https://api.example.com?access_token=secret" }
      })
    ).toThrow('Provider metadata field "baseUrl" contains secret-like content');
  });
});

describe("secret service", () => {
  it("registers BYOK credentials by secret reference and emits sanitized audit", async () => {
    const vault = {
      store: vi.fn().mockResolvedValue("secret_ref_1"),
      rotate: vi.fn(),
      revoke: vi.fn(),
      access: vi.fn()
    };
    const audit = vi.fn();
    const repository = {
      create: vi.fn().mockResolvedValue("11111111-1111-4111-8111-111111111111"),
      updateSecretRef: vi.fn(),
      revoke: vi.fn(),
      findIdBySecretRef: vi.fn()
    };
    const service = createSecretService({ vault, audit, repository });

    await expect(
      service.register({
        tenantId: "tenant-1",
        actorUserId: "user-1",
        label: "OpenAI primary",
        registration: createOpenAIProviderRegistration({ apiKey: "sk-openai", projectId: "proj_123" })
      })
    ).resolves.toEqual({
      tenantId: "tenant-1",
      providerKind: "openai",
      label: "OpenAI primary",
      secretRef: "secret_ref_1",
      metadata: { projectId: "proj_123" },
      revokedAt: null
    });

    expect(audit).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      actorUserId: "user-1",
      eventType: "secret.created",
      entityType: "secret_reference",
      entityId: "11111111-1111-4111-8111-111111111111",
      metadata: {
        providerKind: "openai",
        label: "OpenAI primary",
        projectId: "proj_123"
      }
    });
    expect(repository.create).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      providerKind: "openai",
      label: "OpenAI primary",
      secretRef: "secret_ref_1",
      metadata: { projectId: "proj_123" },
      revokedAt: null
    });
  });

  it("returns public provider connection state without exposing secret references", async () => {
    const vault = {
      store: vi.fn().mockResolvedValue("wf_secret_hidden"),
      rotate: vi.fn(),
      revoke: vi.fn(),
      access: vi.fn()
    };
    const service = createSecretService({
      vault,
      audit: vi.fn(),
      repository: {
        create: vi.fn().mockResolvedValue("11111111-1111-4111-8111-111111111111"),
        updateSecretRef: vi.fn(),
        revoke: vi.fn(),
        findIdBySecretRef: vi.fn()
      }
    });

    const response = await service.registerProviderCredential({
      tenantId: "tenant-1",
      actorUserId: "user-1",
      label: "OpenAI primary",
      registration: createOpenAIProviderRegistration({ apiKey: "sk-openai", projectId: "proj_123" })
    });

    expect(response).toEqual({
      providerKind: "openai",
      label: "OpenAI primary",
      connected: true,
      metadata: { projectId: "proj_123" }
    });
    expect(JSON.stringify(response)).not.toMatch(/wf_secret_hidden|sk-openai|secretRef/i);
  });

  it("does not expose Codex auth-state metadata in public connection responses", async () => {
    const service = createSecretService({
      vault: {
        store: vi.fn().mockResolvedValue("wf_secret_codex"),
        rotate: vi.fn(),
        revoke: vi.fn(),
        access: vi.fn()
      },
      audit: vi.fn(),
      repository: {
        create: vi.fn().mockResolvedValue("11111111-1111-4111-8111-111111111111"),
        updateSecretRef: vi.fn(),
        revoke: vi.fn(),
        findIdBySecretRef: vi.fn()
      }
    });

    const response = await service.registerProviderCredential({
      tenantId: "tenant-1",
      actorUserId: "user-1",
      label: "OpenAI Codex",
      registration: {
        provider: { kind: "openai_chatgpt_codex_subscription", label: "OpenAI ChatGPT/Codex Subscription", requiredSecrets: [], metadataFields: [] },
        secretValues: {},
        metadata: { codexHome: "C:/wf-auth/tenant-1/codex", authStateRef: "codex-auth-state" }
      }
    });

    expect(response).toEqual({
      providerKind: "openai_chatgpt_codex_subscription",
      label: "OpenAI Codex",
      connected: true,
      metadata: {}
    });
    expect(JSON.stringify(response)).not.toMatch(/codexHome|authStateRef|wf_secret_codex/i);
  });

  it("rotates, revokes, and accesses secrets by reference only", async () => {
    const vault = {
      store: vi.fn(),
      rotate: vi.fn().mockResolvedValue("secret_ref_2"),
      revoke: vi.fn().mockResolvedValue(undefined),
      access: vi.fn().mockResolvedValue("sk-runtime")
    };
    const audit = vi.fn();
    const repository = {
      create: vi.fn(),
      updateSecretRef: vi.fn().mockResolvedValue("22222222-2222-4222-8222-222222222222"),
      revoke: vi.fn().mockResolvedValue("22222222-2222-4222-8222-222222222222"),
      findIdBySecretRef: vi.fn().mockResolvedValue("")
    };
    const service = createSecretService({ vault, audit, repository });

    await expect(
      service.rotate({
        tenantId: "tenant-1",
        actorUserId: "user-1",
        secretRef: "secret_ref_1",
        nextSecretValues: { apiKey: "sk-next" }
      })
    ).resolves.toEqual({ secretRef: "secret_ref_2" });

    await service.revoke({ tenantId: "tenant-1", actorUserId: "user-1", secretRef: "secret_ref_2" });
    await expect(service.access({ tenantId: "tenant-1", runId: "run-1", secretRef: "secret_ref_2" })).rejects.toMatchObject({
      code: "secret_reference_unavailable",
      publicMessage: "credential_invalid"
    });

    expect(JSON.stringify(audit.mock.calls)).not.toContain("sk-next");
    expect(JSON.stringify(audit.mock.calls)).not.toContain("sk-runtime");
    expect(audit.mock.calls.every((call) => call[0].entityType === "secret_reference")).toBe(true);
    expect(audit.mock.calls.every((call) => /^[0-9a-f-]{36}$/i.test(call[0].entityId))).toBe(true);
    expect(JSON.stringify(audit.mock.calls)).not.toContain("secret_ref_");
    expect(repository.updateSecretRef).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      previousSecretRef: "secret_ref_1",
      nextSecretRef: "secret_ref_2"
    });
    expect(repository.revoke).toHaveBeenCalledWith({ tenantId: "tenant-1", secretRef: "secret_ref_2" });
  });

  it("allows already-bound runs to access a replaced credential by passing the run id to repository resolution", async () => {
    const vault = {
      store: vi.fn(),
      rotate: vi.fn(),
      revoke: vi.fn(),
      access: vi.fn().mockResolvedValue({ apiKey: "sk-old" })
    };
    const repository = {
      create: vi.fn(),
      updateSecretRef: vi.fn(),
      revoke: vi.fn(),
      findIdBySecretRef: vi.fn().mockResolvedValue("11111111-1111-4111-8111-111111111111")
    };
    const service = createSecretService({ vault, audit: vi.fn(), repository });

    await expect(service.access({ tenantId: "tenant-1", runId: "run-queued-1", secretRef: "secret_ref_old" })).resolves.toEqual({
      apiKey: "sk-old"
    });

    expect(repository.findIdBySecretRef).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      secretRef: "secret_ref_old",
      runId: "run-queued-1"
    });
  });

  it("still fails closed for manually revoked credentials when the repository refuses the run-bound lookup", async () => {
    const service = createSecretService({
      vault: {
        store: vi.fn(),
        rotate: vi.fn(),
        revoke: vi.fn(),
        access: vi.fn()
      },
      audit: vi.fn(),
      repository: {
        create: vi.fn(),
        updateSecretRef: vi.fn(),
        revoke: vi.fn(),
        findIdBySecretRef: vi.fn().mockResolvedValue("")
      }
    });

    await expect(service.access({ tenantId: "tenant-1", runId: "run-queued-1", secretRef: "secret_ref_old" })).rejects.toMatchObject({
      code: "secret_reference_unavailable",
      publicMessage: "credential_invalid"
    });
  });
});
