import { describe, expect, it, vi } from "vitest";

import { createTenantSettingsApi } from "../src/api/tenant-settings-api.js";

const session = { userId: "user-1", tenantId: "tenant-1", role: "member" as const };

describe("tenant settings API", () => {
  it("registers provider credentials only after auth and tenant membership", async () => {
    const deps = {
      authenticate: vi.fn().mockResolvedValue(session),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      registerProviderCredential: vi.fn().mockResolvedValue({ providerKind: "anthropic_api", label: "Anthropic", connected: true }),
      registerStorageConnector: vi.fn()
    };
    const api = createTenantSettingsApi(deps);

    await expect(
      api.registerProviderCredential({
        authorization: "Bearer valid",
        providerKind: "anthropic_api",
        label: "Anthropic",
        secretValues: { apiKey: "sk-ant-secret" },
        metadata: { workspaceLabel: "Marketing" }
      })
    ).resolves.toEqual({ providerKind: "anthropic_api", label: "Anthropic", connected: true });

    expect(deps.registerProviderCredential).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      actorUserId: "user-1",
      providerKind: "anthropic_api",
      label: "Anthropic",
      secretValues: { apiKey: "sk-ant-secret" },
      metadata: { workspaceLabel: "Marketing" }
    });
  });

  it("rejects secret-like provider metadata before persistence", async () => {
    const deps = {
      authenticate: vi.fn().mockResolvedValue(session),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      registerProviderCredential: vi.fn(),
      registerStorageConnector: vi.fn()
    };
    const api = createTenantSettingsApi(deps);

    await expect(
      api.registerProviderCredential({
        authorization: "Bearer valid",
        providerKind: "openrouter_api",
        label: "OpenRouter",
        secretValues: { apiKey: "sk-or-secret" },
        metadata: { backupToken: "not-allowed" }
      })
    ).rejects.toThrow("Provider metadata cannot contain secret-like fields");

    expect(deps.registerProviderCredential).not.toHaveBeenCalled();
  });

  it("rejects nested secret-like provider metadata and storage targets", async () => {
    const deps = {
      authenticate: vi.fn().mockResolvedValue(session),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      registerProviderCredential: vi.fn(),
      registerStorageConnector: vi.fn()
    };
    const api = createTenantSettingsApi(deps);

    await expect(
      api.registerProviderCredential({
        authorization: "Bearer valid",
        providerKind: "openrouter_api",
        label: "OpenRouter",
        secretValues: { apiKey: "sk-or-secret" },
        metadata: { public: { apiKey: "not-allowed" } }
      })
    ).rejects.toThrow("Provider metadata cannot contain secret-like fields");

    await expect(
      api.registerStorageConnector({
        authorization: "Bearer valid",
        providerKind: "google_drive",
        displayName: "Company Drive",
        secretRefs: { oauthTokenRef: "vault://oauth" },
        publicTarget: { oauthTokenRef: "vault://oauth" }
      })
    ).rejects.toThrow("Storage target cannot contain secret-like fields");

    expect(deps.registerProviderCredential).not.toHaveBeenCalled();
    expect(deps.registerStorageConnector).not.toHaveBeenCalled();
  });

  it("rejects secret-like public metadata and target values", async () => {
    const deps = {
      authenticate: vi.fn().mockResolvedValue(session),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      registerProviderCredential: vi.fn(),
      registerStorageConnector: vi.fn()
    };
    const api = createTenantSettingsApi(deps);

    await expect(
      api.registerProviderCredential({
        authorization: "Bearer valid",
        providerKind: "openrouter_api",
        label: "OpenRouter",
        secretValues: { apiKey: "sk-or-secret" },
        metadata: { note: "Bearer should-not-be-public" }
      })
    ).rejects.toThrow("Provider metadata cannot contain secret-like fields");

    await expect(
      api.registerStorageConnector({
        authorization: "Bearer valid",
        providerKind: "dropbox",
        displayName: "Dropbox",
        secretRefs: { oauthTokenRef: "vault://oauth" },
        publicTarget: { folderLabel: "Exports?access_token=should-not-be-public" }
      })
    ).rejects.toThrow("Storage target cannot contain secret-like fields");
  });

  it("registers storage connector summaries without returning OAuth references", async () => {
    const deps = {
      authenticate: vi.fn().mockResolvedValue(session),
      requireTenantMember: vi.fn().mockResolvedValue(undefined),
      registerProviderCredential: vi.fn(),
      registerStorageConnector: vi.fn().mockResolvedValue({
        id: "storage-connector-1",
        providerKind: "google_drive",
        displayName: "Company Drive",
        connected: true,
        publicTarget: { folderLabel: "Exports" }
      })
    };
    const api = createTenantSettingsApi(deps);

    const response = await api.registerStorageConnector({
      authorization: "Bearer valid",
      providerKind: "google_drive",
      displayName: "Company Drive",
      secretRefs: { oauthTokenRef: "vault://oauth", refreshTokenRef: "vault://refresh" },
      publicTarget: { folderLabel: "Exports" }
    });

    expect(response).toEqual({
      id: "storage-connector-1",
      providerKind: "google_drive",
      displayName: "Company Drive",
      connected: true,
      publicTarget: { folderLabel: "Exports" }
    });
    expect(JSON.stringify(response)).not.toMatch(/vault|oauth|refresh|secret/i);
  });
});
