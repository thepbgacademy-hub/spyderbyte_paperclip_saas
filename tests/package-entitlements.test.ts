import { describe, expect, it } from "vitest";

import { createEntitlementService } from "../src/packages/entitlement-service.js";
import { createPackageAssetRegistry } from "../src/packages/package-asset-registry.js";
import type { TenantPackageState, WealthFactoryPackage } from "../src/packages/package-types.js";

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

const brandSeoPackage: WealthFactoryPackage = {
  id: "pkg-brand-seo",
  name: "Brand SEO",
  kind: "industry",
  includedWorkflowIds: ["wf-seo-audit"],
  includedEmployeeIds: ["ceo"],
  allowedAssetIds: ["asset-seo-rules"],
  requiredProviderCapabilities: ["text_generation"],
  optionalProviderCapabilities: []
};

describe("package entitlements", () => {
  it("allows only workflows and assets from the installed package", () => {
    const service = createEntitlementService({ packages: [socialPackage, brandSeoPackage] });
    const tenant: TenantPackageState = {
      tenantId: "tenant-1",
      subscriptionStatus: "active",
      installedPackageId: "pkg-social",
      purchasedAddOnEmployeeIds: [],
      connectedProviderCapabilities: ["text_generation"]
    };

    expect(service.canRunWorkflow(tenant, "wf-social-calendar")).toEqual({ allowed: true });
    expect(service.canRunWorkflow(tenant, "wf-seo-audit")).toMatchObject({ allowed: false, reason: "workflow_not_in_package" });

    const assets = createPackageAssetRegistry([
      { id: "asset-social-rules", packageId: "pkg-social", type: "rules", privateRef: "pc-social-rules" },
      { id: "asset-seo-rules", packageId: "pkg-brand-seo", type: "rules", privateRef: "pc-seo-rules" }
    ]);
    expect(assets.resolveAllowedAsset(socialPackage, "asset-social-rules")).toMatchObject({ id: "asset-social-rules" });
    expect(() => assets.resolveAllowedAsset(socialPackage, "asset-seo-rules")).toThrow("Asset is not allowed for this package");
  });

  it("requires active subscription and package-specific provider capabilities", () => {
    const service = createEntitlementService({ packages: [socialPackage] });

    expect(
      service.canRunWorkflow(
        {
          tenantId: "tenant-1",
          subscriptionStatus: "past_due",
          installedPackageId: "pkg-social",
          purchasedAddOnEmployeeIds: [],
          connectedProviderCapabilities: ["text_generation"]
        },
        "wf-social-calendar"
      )
    ).toMatchObject({ allowed: false, reason: "subscription_inactive" });

    expect(
      service.canUseCapability(
        {
          tenantId: "tenant-1",
          subscriptionStatus: "active",
          installedPackageId: "pkg-social",
          purchasedAddOnEmployeeIds: [],
          connectedProviderCapabilities: ["text_generation"]
        },
        "image_generation"
      )
    ).toMatchObject({ allowed: false, reason: "provider_not_connected" });
  });
});
