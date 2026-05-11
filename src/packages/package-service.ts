import type { WealthFactoryPackage } from "./package-types.js";

export type PackageInstallSummary = {
  id: string;
  tenantId: string;
  packageId: string;
  installedByUserId: string;
  status: "active" | "paused" | "removed";
};

export function createPackageService(options: { packages: readonly WealthFactoryPackage[]; purchasedPackagesByTenant: Record<string, readonly string[]> }) {
  const packagesById = new Map(options.packages.map((packageDefinition) => [packageDefinition.id, packageDefinition]));
  const installs = new Map<string, PackageInstallSummary>();
  let nextId = 1;

  return {
    installPackage(input: { tenantId: string; packageId: string; installedByUserId: string }): PackageInstallSummary {
      if (!packagesById.has(input.packageId)) {
        throw new Error("Package does not exist");
      }

      const tenantPurchased = new Set(options.purchasedPackagesByTenant[input.tenantId] ?? []);
      if (!tenantPurchased.has(input.packageId)) {
        throw new Error("Package is not purchased by this tenant");
      }

      const installKey = `${input.tenantId}:${input.packageId}`;
      const existing = installs.get(installKey);
      if (existing) {
        return { ...existing };
      }

      const install: PackageInstallSummary = {
        id: `install-${nextId++}`,
        tenantId: input.tenantId,
        packageId: input.packageId,
        installedByUserId: input.installedByUserId,
        status: "active"
      };
      installs.set(installKey, install);
      return { ...install };
    }
  };
}
