import { describe, expect, it } from "vitest";

import { createPackageService } from "../src/packages/package-service.js";
import type { WealthFactoryPackage } from "../src/packages/package-types.js";

const clientOpsPackage: WealthFactoryPackage = {
  id: "pkg-client-ops",
  name: "Client Ops",
  kind: "industry",
  includedWorkflowIds: ["wf-client-ops-brief"],
  includedEmployeeIds: ["ceo"],
  allowedAssetIds: ["asset-client-ops-rules"],
  requiredProviderCapabilities: ["text_generation"],
  optionalProviderCapabilities: ["image_generation", "video_generation", "media_storage"]
};

describe("package install service", () => {
  it("installs a purchased package idempotently", () => {
    const service = createPackageService({ packages: [clientOpsPackage], purchasedPackagesByTenant: { "tenant-1": ["pkg-client-ops"] } });
    expect(service.installPackage({ tenantId: "tenant-1", packageId: "pkg-client-ops", installedByUserId: "user-1" })).toEqual({
      id: "install-1",
      tenantId: "tenant-1",
      packageId: "pkg-client-ops",
      installedByUserId: "user-1",
      status: "active"
    });
    expect(service.installPackage({ tenantId: "tenant-1", packageId: "pkg-client-ops", installedByUserId: "user-1" })).toMatchObject({
      id: "install-1",
      status: "active"
    });
  });

  it("blocks unpurchased package install attempts", () => {
    const service = createPackageService({ packages: [clientOpsPackage], purchasedPackagesByTenant: { "tenant-2": ["pkg-client-ops"] } });
    expect(() => service.installPackage({ tenantId: "tenant-1", packageId: "pkg-client-ops", installedByUserId: "user-1" })).toThrow(
      "Package is not purchased by this tenant"
    );
  });
});
