import type { ProviderCapability, WealthFactoryPackage } from "./package-types.js";

export function listPackageProviderRequirements(packageDefinition: WealthFactoryPackage): {
  required: readonly ProviderCapability[];
  optional: readonly ProviderCapability[];
} {
  return {
    required: packageDefinition.requiredProviderCapabilities,
    optional: packageDefinition.optionalProviderCapabilities
  };
}
