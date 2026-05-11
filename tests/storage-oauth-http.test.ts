import { describe, expect, it, vi } from "vitest";

import { createStorageOAuthHttpHandler } from "../src/api/storage-oauth-http.js";

const session = { userId: "user-1", tenantId: "tenant-1", role: "member" as const };

function createHandler() {
  const storageOAuth = {
    begin: vi.fn().mockResolvedValue({
      authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth?state=opaque&prompt=consent&access_type=offline",
      expiresAt: "2026-05-11T00:10:00.000Z"
    }),
    complete: vi.fn().mockResolvedValue({
      id: "storage-connector-1",
      providerKind: "google_drive",
      displayName: "Google Drive",
      connected: true,
      publicTarget: { folderLabel: "Exports" }
    })
  };
  const handler = createStorageOAuthHttpHandler({
    allowedOrigins: ["https://portal.spyderbyte.cloud"],
    authenticate: vi.fn().mockResolvedValue(session),
    requireTenantMember: vi.fn().mockResolvedValue(undefined),
    storageOAuth,
    rateLimiter: { consume: vi.fn().mockReturnValue({ allowed: true, remaining: 59, resetAt: Date.now() + 60_000 }) }
  });
  return { handler, storageOAuth };
}

describe("storage OAuth HTTP handler", () => {
  it("starts storage OAuth through an authenticated Wealth Factory route", async () => {
    const { handler, storageOAuth } = createHandler();

    const response = await handler({
      method: "GET",
      path: "/api/storage/oauth/google_drive/begin",
      query: { displayName: "Company Drive", folderLabel: "Exports" },
      headers: { authorization: "Bearer valid", origin: "https://portal.spyderbyte.cloud" },
      bodyByteLength: 0,
      ip: "127.0.0.1"
    });

    expect(response.status).toBe(200);
    expect(storageOAuth.begin).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      actorUserId: "user-1",
      providerKind: "google_drive",
      displayName: "Company Drive",
      publicTarget: { folderLabel: "Exports" }
    });
    expect(JSON.stringify(response.body)).not.toMatch(/wf_secret|refreshToken|accessToken/i);
  });

  it("completes storage OAuth callback without exposing secret references", async () => {
    const { handler, storageOAuth } = createHandler();

    const response = await handler({
      method: "GET",
      path: "/api/storage/oauth/google_drive/callback",
      query: { state: "opaque", code: "oauth-code" },
      headers: {},
      bodyByteLength: 0,
      ip: "127.0.0.1"
    });

    expect(response.status).toBe(200);
    expect(storageOAuth.complete).toHaveBeenCalledWith({ state: "opaque", code: "oauth-code" });
    expect(JSON.stringify(response.body)).not.toMatch(/wf_secret|oauthTokenRef|refreshTokenRef/i);
  });
});
