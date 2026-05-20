import { describe, expect, it, vi } from "vitest";

import { createPostgresOAuthStateStore } from "../src/storage/postgres-oauth-state-store.js";

describe("postgres oauth state store", () => {
  it("stores and atomically consumes pending oauth state", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            tenant_id: "tenant-1",
            actor_user_id: "user-1",
            provider_kind: "google_drive",
            display_name: "Company Drive",
            public_target: { folderLabel: "Exports" },
            code_verifier: "verifier",
            expires_at: "2099-05-19T20:00:00.000Z"
          }
        ]
      });
    const store = createPostgresOAuthStateStore({ query });

    await store.save({
      state: "opaque",
      value: {
        tenantId: "tenant-1",
        actorUserId: "user-1",
        providerKind: "google_drive",
        displayName: "Company Drive",
        publicTarget: { folderLabel: "Exports" },
        codeVerifier: "verifier",
        expiresAt: "2099-05-19T20:00:00.000Z"
      }
    });
    await expect(store.consume({ state: "opaque" })).resolves.toEqual({
      tenantId: "tenant-1",
      actorUserId: "user-1",
      providerKind: "google_drive",
      displayName: "Company Drive",
      publicTarget: { folderLabel: "Exports" },
      codeVerifier: "verifier",
      expiresAt: "2099-05-19T20:00:00.000Z"
    });

    expect(String(query.mock.calls[0]?.[0])).toMatch(/delete from wfpc_private\.oauth_pending_states where expires_at <= now\(\)/i);
    expect(String(query.mock.calls[1]?.[0])).toMatch(/insert into wfpc_private\.oauth_pending_states/i);
    expect(String(query.mock.calls[2]?.[0])).toMatch(/delete from wfpc_private\.oauth_pending_states where expires_at <= now\(\)/i);
    expect(String(query.mock.calls[3]?.[0])).toMatch(/delete from wfpc_private\.oauth_pending_states/i);
  });
});
