import type { PackageInstallResult } from "../db/acid-guard-repository.js";

export type AcidPackageInstallRepository = {
  installPackage(input: { tenantId: string; packageId: string; userId: string }): Promise<PackageInstallResult>;
};

export type PackagePurchaseAuthorizer = {
  canInstallPackage(input: { tenantId: string; packageId: string; userId: string }): Promise<boolean>;
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
  purchaseAuthorizer: PackagePurchaseAuthorizer;
}) {
  return {
    async installPackage(input: { tenantId: string; packageId: string; userId: string }): Promise<PackageInstallResult> {
      if (!(await options.purchaseAuthorizer.canInstallPackage(input))) {
        throw new PackageInstallAuthorizationError();
      }

      return options.repository.installPackage(input);
    }
  };
}
