export type DashboardSnapshot = {
  tenantName: string;
  packageName: string;
  requiredProviders: readonly string[];
  optionalProviders: readonly string[];
  artifactTtlHours: number;
};

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
  artifactTtlHours: 24
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

function mapDashboardResponse(response: unknown): DashboardSnapshot {
  const record = response && typeof response === "object" ? (response as Record<string, unknown>) : {};
  const packages = Array.isArray(record.packages) ? record.packages : [];
  const providerConnections = Array.isArray(record.providerConnections) ? record.providerConnections : [];
  const packageRecord = packages[0] && typeof packages[0] === "object" ? (packages[0] as Record<string, unknown>) : {};

  return {
    tenantName: "Wealth Factory Company",
    packageName: typeof packageRecord.name === "string" ? packageRecord.name : "No package installed",
    requiredProviders: providerConnections
      .filter((provider) => {
        const providerRecord = provider && typeof provider === "object" ? (provider as Record<string, unknown>) : {};
        return providerRecord.connected === true;
      })
      .map((provider) => {
        const providerRecord = provider && typeof provider === "object" ? (provider as Record<string, unknown>) : {};
        return String(providerRecord.label ?? providerRecord.providerKind ?? "Provider");
      }),
    optionalProviders: ["customer-owned storage"],
    artifactTtlHours: 24
  };
}

export const dashboardClient = createDashboardClient(defaultSnapshot);
