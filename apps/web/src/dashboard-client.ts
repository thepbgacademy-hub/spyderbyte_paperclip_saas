export type DashboardRole = "member" | "operator";

export type DashboardWorkflow = {
  id: string;
  name: string;
  providerKind: string;
  enabled: boolean;
};

export type DashboardArtifact = {
  id: string;
  filename: string;
  artifactType: string;
  expiresAt: string;
};

export type DashboardProviderConnection = {
  providerKind: string;
  label: string;
  connected: boolean;
  required?: boolean;
};

export type DashboardStorageConnector = {
  id: string;
  providerKind: string;
  displayName: string;
  connected: boolean;
  publicTarget: Record<string, unknown>;
};

export type DashboardSnapshot = {
  tenantName: string;
  packageName: string;
  requiredProviders: readonly string[];
  optionalProviders: readonly string[];
  artifactTtlHours: number;
  role: DashboardRole;
  workflows: readonly DashboardWorkflow[];
  artifacts: readonly DashboardArtifact[];
  providerConnections: readonly DashboardProviderConnection[];
  storageConnectors: readonly DashboardStorageConnector[];
};

export type DashboardBootstrap = {
  initialSnapshot?: DashboardSnapshot;
};

declare global {
  interface Window {
    __WF_DASHBOARD_BOOTSTRAP__?: DashboardBootstrap;
  }
}

type DashboardClientOptions =
  | DashboardSnapshot
  | {
      apiBaseUrl: string;
      fetchImpl: typeof fetch;
      fallbackSnapshot?: DashboardSnapshot;
    };

const defaultSnapshot: DashboardSnapshot = {
  tenantName: "Northstar Labs",
  packageName: "Social Media Agency",
  requiredProviders: ["OpenAI"],
  optionalProviders: ["image and video providers", "customer-owned storage"],
  artifactTtlHours: 24,
  role: "member",
  workflows: [],
  artifacts: [],
  providerConnections: [],
  storageConnectors: []
};

export function createDashboardClient(options: DashboardClientOptions) {
  const snapshot = "apiBaseUrl" in options ? (options.fallbackSnapshot ?? defaultSnapshot) : options;
  const apiBaseUrl = "apiBaseUrl" in options ? options.apiBaseUrl : "";
  const fetchImpl = "apiBaseUrl" in options ? options.fetchImpl : undefined;

  return {
    getSnapshot(): DashboardSnapshot {
      return snapshot;
    },

    async fetchSnapshot(request: { authorization: string }): Promise<DashboardSnapshot> {
      if (!fetchImpl) {
        return snapshot;
      }

      const response = await fetchImpl(`${apiBaseUrl}/api/dashboard`, {
        headers: { authorization: request.authorization }
      });
      if (!response.ok) {
        throw new Error("Unable to load dashboard");
      }

      return mapDashboardResponse(await response.json());
    }
  };
}

export function getBrowserDashboardBootstrap(browserWindow: Window = window): DashboardBootstrap | null {
  return browserWindow.__WF_DASHBOARD_BOOTSTRAP__ ?? null;
}

export function createBrowserDashboardClient(browserWindow: Window = window) {
  const bootstrap = getBrowserDashboardBootstrap(browserWindow);
  const fallbackSnapshot = bootstrap?.initialSnapshot ?? defaultSnapshot;

  return {
    authorization: null,
    client: createDashboardClient(fallbackSnapshot)
  };
}

function mapDashboardResponse(response: unknown): DashboardSnapshot {
  const record = response && typeof response === "object" ? (response as Record<string, unknown>) : {};
  const packages = Array.isArray(record.packages) ? record.packages : [];
  const providerConnections = Array.isArray(record.providerConnections) ? record.providerConnections : [];
  const artifacts = Array.isArray(record.artifacts) ? record.artifacts : [];
  const workflows = Array.isArray(record.workflows) ? record.workflows : [];
  const storageConnectors = Array.isArray(record.storageConnectors) ? record.storageConnectors : [];
  const packageRecord = packages[0] && typeof packages[0] === "object" ? (packages[0] as Record<string, unknown>) : {};
  const mappedProviderConnections = providerConnections.map(mapProviderConnection);
  const requiredProviders = mappedProviderConnections
    .filter((provider) => provider.required !== false)
    .map((provider) => provider.label);
  const optionalProviders = mappedProviderConnections
    .filter((provider) => provider.required === false)
    .map((provider) => provider.label);

  return {
    tenantName: typeof record.tenantName === "string" ? record.tenantName : defaultSnapshot.tenantName,
    packageName: typeof packageRecord.name === "string" ? packageRecord.name : "No package installed",
    requiredProviders,
    optionalProviders: optionalProviders.length > 0 ? [...optionalProviders, "customer-owned storage"] : ["customer-owned storage"],
    artifactTtlHours: 24,
    role: record.role === "operator" ? "operator" : "member",
    workflows: workflows.map(mapWorkflow),
    artifacts: artifacts.map(mapArtifact),
    providerConnections: mappedProviderConnections,
    storageConnectors: storageConnectors.map(mapStorageConnector)
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function mapWorkflow(value: unknown): DashboardWorkflow {
  const record = asRecord(value);
  return {
    id: String(record.id ?? "workflow"),
    name: String(record.name ?? "Workflow"),
    providerKind: String(record.providerKind ?? record.provider_kind ?? "provider"),
    enabled: record.enabled !== false
  };
}

function mapArtifact(value: unknown): DashboardArtifact {
  const record = asRecord(value);
  return {
    id: String(record.id ?? "artifact"),
    filename: String(record.filename ?? "artifact"),
    artifactType: String(record.artifactType ?? record.artifact_type ?? "file"),
    expiresAt: String(record.expiresAt ?? record.expires_at ?? new Date().toISOString())
  };
}

function mapProviderConnection(value: unknown): DashboardProviderConnection {
  const record = asRecord(value);
  return {
    providerKind: String(record.providerKind ?? record.provider_kind ?? "provider"),
    label: String(record.label ?? record.providerKind ?? record.provider_kind ?? "Provider"),
    connected: record.connected !== false,
    ...(typeof record.required === "boolean" ? { required: record.required } : {})
  };
}

function mapStorageConnector(value: unknown): DashboardStorageConnector {
  const record = asRecord(value);
  return {
    id: String(record.id ?? "storage"),
    providerKind: String(record.providerKind ?? record.provider_kind ?? "storage"),
    displayName: String(record.displayName ?? record.display_name ?? "Storage"),
    connected: record.connected !== false,
    publicTarget: asRecord(record.publicTarget ?? record.public_target)
  };
}

export const dashboardClient = createDashboardClient(defaultSnapshot);
