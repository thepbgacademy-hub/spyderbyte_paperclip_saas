import { describe, expect, it } from "vitest";

import { createPackageService } from "../src/packages/package-service.js";
import type { WealthFactoryPackage } from "../src/packages/package-types.js";

const socialPackage: WealthFactoryPackage = {
  id: "pkg-social",
  name: "Social Media Agency",
  kind: "industry",
  includedWorkflowIds: ["wf-social-calendar"],
  includedEmployeeIds: ["ceo"],
  allowedAssetIds: ["asset-social-rules"],
  requiredProviderCapabilities: ["text_generation"],
  optionalProviderCapabilities: ["image_generation", "video_generation", "media_storage"]
};

describe("package install service", () => {
  it("installs a purchased package idempotently", () => {
    const service = createPackageService({ packages: [socialPackage], purchasedPackagesByTenant: { "tenant-1": ["pkg-social"] } });
    expect(service.installPackage({ tenantId: "tenant-1", packageId: "pkg-social", installedByUserId: "user-1" })).toEqual({
      id: "install-1",
      tenantId: "tenant-1",
      packageId: "pkg-social",
      installedByUserId: "user-1",
      status: "active"
    });
    expect(service.installPackage({ tenantId: "tenant-1", packageId: "pkg-social", installedByUserId: "user-1" })).toMatchObject({
      id: "install-1",
      status: "active"
    });
  });

  it("blocks unpurchased package install attempts", () => {
    const service = createPackageService({ packages: [socialPackage], purchasedPackagesByTenant: { "tenant-2": ["pkg-social"] } });
    expect(() => service.installPackage({ tenantId: "tenant-1", packageId: "pkg-social", installedByUserId: "user-1" })).toThrow(
      "Package is not purchased by this tenant"
    );
  });
});
