import { describe, expect, it, vi } from "vitest";

import { createMemoryOAuthStateStore, createStorageOAuthService, STORAGE_OAUTH_PROVIDER_CONFIGS } from "../src/storage/storage-oauth-service.js";

function createService() {
  const registration = {
    register: vi.fn().mockResolvedValue({
      id: "storage-connector-1",
      providerKind: "google_drive",
      displayName: "Company Drive",
      connected: true,
      publicTarget: { folderLabel: "Exports" }
    })
  };
  const fetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: vi.fn().mockResolvedValue({ access_token: "ya29.access", refresh_token: "1//refresh" })
  });
  const service = createStorageOAuthService({
    providers: {
      google_drive: STORAGE_OAUTH_PROVIDER_CONFIGS.googleDrive({
        clientId: "google-client",
        redirectUri: "https://api.spyderbyte.cloud/api/storage/oauth/google/callback"
      }),
      dropbox: STORAGE_OAUTH_PROVIDER_CONFIGS.dropbox({
        clientId: "dropbox-client",
        redirectUri: "https://api.spyderbyte.cloud/api/storage/oauth/dropbox/callback"
      })
    },
    stateStore: createMemoryOAuthStateStore(),
    registration,
    fetch,
    now: () => new Date("2026-05-11T00:00:00.000Z")
  });
  return { service, registration, fetch };
}

describe("storage OAuth service", () => {
  it("starts Google Drive OAuth with PKCE and no token material in the public response", async () => {
    const { service } = createService();

    const response = await service.begin({
      tenantId: "tenant-1",
      actorUserId: "user-1",
      providerKind: "google_drive",
      displayName: "Company Drive",
      publicTarget: { folderLabel: "Exports" }
    });

    const url = new URL(response.authorizationUrl);
    expect(url.origin).toBe("https://accounts.google.com");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("prompt")).toBe("consent");
    expect(url.searchParams.get("scope")).toContain("drive.file");
    expect(JSON.stringify(response)).not.toMatch(/oauthToken|refresh|access_token|wf_secret|secret/i);
  });

  it("exchanges OAuth callback codes, stores tokens in the vault, and returns only connector summaries", async () => {
    const { service, registration, fetch } = createService();
    const begin = await service.begin({
      tenantId: "tenant-1",
      actorUserId: "user-1",
      providerKind: "google_drive",
      displayName: "Company Drive",
      publicTarget: { folderLabel: "Exports" }
    });
    const state = new URL(begin.authorizationUrl).searchParams.get("state") ?? "";

    const response = await service.complete({ state, code: "oauth-code", providerKind: "google_drive" });

    expect(fetch).toHaveBeenCalledWith(
      "https://oauth2.googleapis.com/token",
      expect.objectContaining({ method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" } })
    );
    expect(registration.register).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      actorUserId: "user-1",
      providerKind: "google_drive",
      displayName: "Company Drive",
      secretValues: { accessToken: "ya29.access", refreshToken: "1//refresh" },
      publicTarget: { folderLabel: "Exports" }
    });
    expect(JSON.stringify(response)).not.toMatch(/ya29|refresh|wf_secret|oauthTokenRef/i);
  });

  it("rejects replayed, expired, or secret-like storage OAuth state", async () => {
    const { service } = createService();

    await expect(
      service.begin({
        tenantId: "tenant-1",
        actorUserId: "user-1",
        providerKind: "dropbox",
        displayName: "Dropbox",
        publicTarget: { folderLabel: "wf_secret_should_not_leave" }
      })
    ).rejects.toThrow("Storage target cannot contain secret-like fields");

    await expect(service.complete({ state: "missing", code: "oauth-code", providerKind: "dropbox" })).rejects.toThrow(
      "Storage authorization expired"
    );
  });

  it("reports per-provider availability instead of requiring every provider to be configured", async () => {
    const registration = {
      register: vi.fn()
    };
    const fetch = vi.fn();
    const service = createStorageOAuthService({
      providers: {
        google_drive: STORAGE_OAUTH_PROVIDER_CONFIGS.googleDrive({
          clientId: "google-client",
          redirectUri: "https://api.spyderbyte.cloud/api/storage/oauth/google/callback"
        })
      },
      stateStore: createMemoryOAuthStateStore(),
      registration,
      fetch,
      now: () => new Date("2026-05-11T00:00:00.000Z")
    });

    expect(service.isProviderAvailable("google_drive")).toBe(true);
    expect(service.isProviderAvailable("dropbox")).toBe(false);
    await expect(
      service.begin({
        tenantId: "tenant-1",
        actorUserId: "user-1",
        providerKind: "dropbox",
        displayName: "Dropbox",
        publicTarget: {}
      })
    ).rejects.toThrow("Storage provider is unavailable");
  });

  it("requires provider refresh tokens for customer-owned storage connectors", async () => {
    const { service, fetch, registration } = createService();
    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ access_token: "ya29.access" })
    });
    const begin = await service.begin({
      tenantId: "tenant-1",
      actorUserId: "user-1",
      providerKind: "google_drive",
      displayName: "Company Drive",
      publicTarget: { folderLabel: "Exports" }
    });

    await expect(
      service.complete({ state: new URL(begin.authorizationUrl).searchParams.get("state") ?? "", code: "oauth-code", providerKind: "google_drive" })
    ).rejects.toThrow(
      "Storage authorization did not return offline access"
    );
    expect(registration.register).not.toHaveBeenCalled();
  });

  it("removes non-secret extra public target fields before persistence", async () => {
    const { service, registration } = createService();
    const begin = await service.begin({
      tenantId: "tenant-1",
      actorUserId: "user-1",
      providerKind: "google_drive",
      displayName: "Company Drive",
      publicTarget: { folderLabel: " Exports ", theme: "blue", nested: { label: "safe" } }
    });

    await service.complete({
      state: new URL(begin.authorizationUrl).searchParams.get("state") ?? "",
      code: "oauth-code",
      providerKind: "google_drive"
    });

    expect(registration.register).toHaveBeenCalledWith(expect.objectContaining({ publicTarget: { folderLabel: "Exports" } }));
  });

  it("rejects extra secret-like public target keys before storing OAuth state", async () => {
    const { service } = createService();

    await expect(
      service.begin({
        tenantId: "tenant-1",
        actorUserId: "user-1",
        providerKind: "google_drive",
        displayName: "Company Drive",
        publicTarget: { folderLabel: "Exports", nested: { refreshToken: "not-allowed" } }
      })
    ).rejects.toThrow("Storage target cannot contain secret-like fields");
  });

  it("fails closed when the callback route provider does not match the pending OAuth state", async () => {
    const { service } = createService();
    const begin = await service.begin({
      tenantId: "tenant-1",
      actorUserId: "user-1",
      providerKind: "google_drive",
      displayName: "Company Drive",
      publicTarget: { folderLabel: "Exports" }
    });

    await expect(
      service.complete({ state: new URL(begin.authorizationUrl).searchParams.get("state") ?? "", code: "oauth-code", providerKind: "dropbox" })
    ).rejects.toThrow("Storage provider mismatch");

    await expect(
      service.complete({
        state: new URL(begin.authorizationUrl).searchParams.get("state") ?? "",
        code: "oauth-code",
        providerKind: "google_drive"
      })
    ).resolves.toEqual(
      expect.objectContaining({
        id: "storage-connector-1",
        providerKind: "google_drive"
      })
    );
  });
});
