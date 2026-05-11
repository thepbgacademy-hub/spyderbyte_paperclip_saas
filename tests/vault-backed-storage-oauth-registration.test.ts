import { describe, expect, it, vi } from "vitest";

import { createVaultBackedStorageOAuthRegistration } from "../src/storage/vault-backed-storage-oauth-registration.js";

describe("vault-backed storage OAuth registration", () => {
  it("stores OAuth tokens and connector secret refs in one database transaction", async () => {
    const transaction = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [
            {
              id: "storage-connector-1",
              provider_kind: "google_drive",
              display_name: "Company Drive",
              public_target: { folderLabel: "Exports" }
            }
          ]
        })
        .mockResolvedValueOnce({ rows: [] })
    };
    const runner = {
      withTransaction: vi.fn().mockImplementation(async (callback: (client: typeof transaction) => Promise<unknown>) => callback(transaction))
    };
    const registration = createVaultBackedStorageOAuthRegistration({
      runner,
      vaultMasterKey: "test-master-key-with-enough-length"
    });

    await expect(
      registration.register({
        tenantId: "tenant-1",
        actorUserId: "user-1",
        providerKind: "google_drive",
        displayName: "Company Drive",
        secretValues: { accessToken: "ya29.access", refreshToken: "1//refresh" },
        publicTarget: { folderLabel: "Exports" }
      })
    ).resolves.toEqual({
      id: "storage-connector-1",
      providerKind: "google_drive",
      displayName: "Company Drive",
      connected: true,
      publicTarget: { folderLabel: "Exports" }
    });

    expect(runner.withTransaction).toHaveBeenCalledOnce();
    expect(String(transaction.query.mock.calls[0]?.[0])).toMatch(/insert into wfpc_private\.vault_secrets/i);
    expect(String(transaction.query.mock.calls[1]?.[0])).toMatch(/insert into wfpc\.storage_connectors/i);
    expect(String(transaction.query.mock.calls[2]?.[0])).toMatch(/insert into wfpc_private\.storage_connector_secrets/i);
  });
});
