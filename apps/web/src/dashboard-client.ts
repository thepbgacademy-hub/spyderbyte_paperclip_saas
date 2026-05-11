export type DashboardSnapshot = {
  tenantName: string;
  packageName: string;
  requiredProviders: readonly string[];
  optionalProviders: readonly string[];
  artifactTtlHours: number;
};

export function createDashboardClient(snapshot: DashboardSnapshot) {
  return {
    getSnapshot(): DashboardSnapshot {
      return snapshot;
    }
  };
}

export const dashboardClient = createDashboardClient({
  tenantName: "Northstar Labs",
  packageName: "Social Media Agency",
  requiredProviders: ["OpenAI"],
  optionalProviders: ["image and video providers", "customer-owned storage"],
  artifactTtlHours: 24
});
