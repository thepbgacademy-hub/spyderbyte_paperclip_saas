import type { HarnessDeliverableType } from "../harness/types.js";
import type { ProviderKind } from "../providers/provider-types.js";

export type PackageKind = "industry" | "blank_canvas";
export type SubscriptionStatus = "active" | "trialing" | "past_due" | "canceled" | "paused";
export type ProviderCapability = "text_generation" | "image_generation" | "video_generation" | "social_publishing" | "media_storage";

export type PackageWorkflowDefinition = {
  publicId: string;
  publicName: string;
  description: string;
  allowedDeliverableTypes: readonly HarnessDeliverableType[];
  requiredProviderCapabilities: readonly ProviderCapability[];
  boardExposureEnabled?: boolean;
  nativeExecutionEnabled?: boolean;
  publicDashboardEnabled?: boolean;
  publicStartEnabled?: boolean;
  providerKind?: ProviderKind;
};

export type WealthFactoryPackage = {
  id: string;
  name: string;
  kind: PackageKind;
  includedWorkflowIds: readonly string[];
  workflowDefinitions?: readonly PackageWorkflowDefinition[];
  includedEmployeeIds: readonly string[];
  allowedAssetIds: readonly string[];
  requiredProviderCapabilities: readonly ProviderCapability[];
  optionalProviderCapabilities: readonly ProviderCapability[];
};

export type TenantPackageState = {
  tenantId: string;
  subscriptionStatus: SubscriptionStatus;
  installedPackageId?: string;
  purchasedAddOnEmployeeIds: readonly string[];
  connectedProviderCapabilities: readonly ProviderCapability[];
};

export type PackageAsset = {
  id: string;
  packageId: string;
  type: "prompt" | "rules" | "template" | "media" | "schema";
  privateRef: string;
};

export type EntitlementDecision =
  | { allowed: true }
  | {
      allowed: false;
      reason: "subscription_inactive" | "package_not_installed" | "workflow_not_in_package" | "capability_not_in_package" | "provider_not_connected";
    };
