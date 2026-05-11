import { describe, expect, it } from "vitest";

import { createStorageConnectorRegistry } from "../src/storage/storage-connector-service.js";

describe("customer-owned storage connector registry", () => {
  it("registers Google Drive and Dropbox connectors by secret reference only", () => {
    const registry = createStorageConnectorRegistry();
    const drive = registry.register({
      tenantId: "tenant-1",
      providerKind: "google_drive",
      displayName: "Company Drive",
      secretRefs: { oauthTokenRef: "vault_ref_1", refreshTokenRef: "vault_ref_2" },
      publicTarget: { folderLabel: "Exports" }
    });

    expect(drive).toMatchObject({
      id: "storage-connector-1",
      tenantId: "tenant-1",
      providerKind: "google_drive",
      displayName: "Company Drive",
      connected: true
    });
    expect(JSON.stringify(drive)).not.toMatch(/vault_ref|oauth|refresh/i);
  });

  it("denies cross-tenant connector reads", () => {
    const registry = createStorageConnectorRegistry();
    const connector = registry.register({
      tenantId: "tenant-1",
      providerKind: "dropbox",
      displayName: "Dropbox",
      secretRefs: { oauthTokenRef: "vault_ref_1", refreshTokenRef: "vault_ref_2" },
      publicTarget: { folderLabel: "Exports" }
    });

    expect(() => registry.getPublicSummary("tenant-2", connector.id)).toThrow("Storage connector is not available");
  });
});
