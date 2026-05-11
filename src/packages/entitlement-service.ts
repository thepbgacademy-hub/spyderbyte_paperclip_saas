import type { EntitlementDecision, ProviderCapability, TenantPackageState, WealthFactoryPackage } from "./package-types.js";

export function createEntitlementService(options: { packages: readonly WealthFactoryPackage[] }) {
  const packagesById = new Map(options.packages.map((packageDefinition) => [packageDefinition.id, packageDefinition]));

  function getInstalledPackage(tenant: TenantPackageState): WealthFactoryPackage | undefined {
    return tenant.installedPackageId ? packagesById.get(tenant.installedPackageId) : undefined;
  }

  function baseDecision(tenant: TenantPackageState): EntitlementDecision | undefined {
    if (tenant.subscriptionStatus !== "active" && tenant.subscriptionStatus !== "trialing") {
      return { allowed: false, reason: "subscription_inactive" };
    }

    if (!getInstalledPackage(tenant)) {
      return { allowed: false, reason: "package_not_installed" };
    }

    return undefined;
  }

  return {
    canRunWorkflow(tenant: TenantPackageState, workflowId: string): EntitlementDecision {
      const blocked = baseDecision(tenant);
      if (blocked) return blocked;

      const packageDefinition = getInstalledPackage(tenant)!;
      if (!packageDefinition.includedWorkflowIds.includes(workflowId)) {
        return { allowed: false, reason: "workflow_not_in_package" };
      }

      for (const capability of packageDefinition.requiredProviderCapabilities) {
        if (!tenant.connectedProviderCapabilities.includes(capability)) {
          return { allowed: false, reason: "provider_not_connected" };
        }
      }

      return { allowed: true };
    },

    canUseCapability(tenant: TenantPackageState, capability: ProviderCapability): EntitlementDecision {
      const blocked = baseDecision(tenant);
      if (blocked) return blocked;

      const packageDefinition = getInstalledPackage(tenant)!;
      const packageAllowsCapability =
        packageDefinition.requiredProviderCapabilities.includes(capability) || packageDefinition.optionalProviderCapabilities.includes(capability);

      if (!packageAllowsCapability) {
        return { allowed: false, reason: "capability_not_in_package" };
      }

      if (!tenant.connectedProviderCapabilities.includes(capability)) {
        return { allowed: false, reason: "provider_not_connected" };
      }

      return { allowed: true };
    }
  };
}
