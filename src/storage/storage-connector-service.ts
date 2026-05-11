import type { StorageProviderKind } from "./storage-provider-types.js";

export type StorageConnectorInput = {
  tenantId: string;
  providerKind: StorageProviderKind;
  displayName: string;
  secretRefs: Record<string, string>;
  publicTarget: { folderLabel?: string; bucketLabel?: string };
};

export type StorageConnectorSummary = {
  id: string;
  tenantId: string;
  providerKind: StorageProviderKind;
  displayName: string;
  connected: boolean;
  publicTarget: { folderLabel?: string; bucketLabel?: string };
};

type StoredStorageConnector = StorageConnectorSummary & {
  secretRefs: Record<string, string>;
};

export function createStorageConnectorRegistry() {
  const connectors = new Map<string, StoredStorageConnector>();
  let nextId = 1;

  function toSummary(connector: StoredStorageConnector): StorageConnectorSummary {
    return {
      id: connector.id,
      tenantId: connector.tenantId,
      providerKind: connector.providerKind,
      displayName: connector.displayName,
      connected: connector.connected,
      publicTarget: { ...connector.publicTarget }
    };
  }

  return {
    register(input: StorageConnectorInput): StorageConnectorSummary {
      const connector: StoredStorageConnector = {
        id: `storage-connector-${nextId++}`,
        tenantId: input.tenantId,
        providerKind: input.providerKind,
        displayName: input.displayName,
        connected: true,
        publicTarget: { ...input.publicTarget },
        secretRefs: { ...input.secretRefs }
      };
      connectors.set(connector.id, connector);
      return toSummary(connector);
    },

    getPublicSummary(tenantId: string, connectorId: string): StorageConnectorSummary {
      const connector = connectors.get(connectorId);
      if (!connector || connector.tenantId !== tenantId) {
        throw new Error("Storage connector is not available");
      }

      return toSummary(connector);
    }
  };
}
