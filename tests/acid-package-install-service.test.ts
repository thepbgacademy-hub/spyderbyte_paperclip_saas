import { describe, expect, it, vi } from "vitest";

import { createAcidPackageInstallService } from "../src/packages/acid-package-install-service.js";

describe("ACID package install service", () => {
  it("installs purchased packages through the transactional repository", async () => {
    const repository = {
      installPackage: vi.fn().mockResolvedValue({ installed: true, id: "install-1", status: "active" })
    };
    const service = createAcidPackageInstallService({ repository });

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

  it("blocks unpurchased package installs from the transactional repository decision", async () => {
    const repository = {
      installPackage: vi.fn().mockResolvedValue({ installed: false, reason: "package_not_purchased" })
    };
    const service = createAcidPackageInstallService({ repository });

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
    expect(repository.installPackage).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      packageId: "pkg-social",
      userId: "user-1"
    });
  });
});
