import type { PackageInstallDecision } from "../db/acid-guard-repository.js";

export type AcidPackageInstallRepository = {
  installPackage(input: { tenantId: string; packageId: string; userId: string }): Promise<PackageInstallDecision>;
};

export class PackageInstallAuthorizationError extends Error {
  readonly code = "package_install_not_authorized";
  readonly publicMessage = "package_unavailable";

  constructor() {
    super("Package install is not authorized for this company");
    this.name = "PackageInstallAuthorizationError";
  }
}

export function createAcidPackageInstallService(options: {
  repository: AcidPackageInstallRepository;
}) {
  return {
    async installPackage(input: { tenantId: string; packageId: string; userId: string }): Promise<{ id: string; status: string }> {
      const result = await options.repository.installPackage(input);
      if (!result.installed) {
        throw new PackageInstallAuthorizationError();
      }

      return { id: result.id, status: result.status };
    }
  };
}
