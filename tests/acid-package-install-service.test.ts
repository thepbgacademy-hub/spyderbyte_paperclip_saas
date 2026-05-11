import { describe, expect, it, vi } from "vitest";

import { createAcidPackageInstallService } from "../src/packages/acid-package-install-service.js";

describe("ACID package install service", () => {
  it("installs purchased packages through the transactional repository", async () => {
    const repository = {
      installPackage: vi.fn().mockResolvedValue({ id: "install-1", status: "active" })
    };
    const purchaseAuthorizer = {
      canInstallPackage: vi.fn().mockResolvedValue(true)
    };
    const service = createAcidPackageInstallService({ repository, purchaseAuthorizer });

    await expect(
      service.installPackage({
        tenantId: "tenant-1",
        packageId: "pkg-social",
        userId: "user-1"
      })
    ).resolves.toEqual({ id: "install-1", status: "active" });

    expect(repository.installPackage).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      packageId: "pkg-social",
      userId: "user-1"
    });
  });

  it("blocks unpurchased package installs before writing to Supabase", async () => {
    const repository = {
      installPackage: vi.fn()
    };
    const service = createAcidPackageInstallService({
      repository,
      purchaseAuthorizer: { canInstallPackage: vi.fn().mockResolvedValue(false) }
    });

    await expect(
      service.installPackage({
        tenantId: "tenant-1",
        packageId: "pkg-social",
        userId: "user-1"
      })
    ).rejects.toMatchObject({
      code: "package_install_not_authorized",
      publicMessage: "package_unavailable"
    });
    expect(repository.installPackage).not.toHaveBeenCalled();
  });
});
