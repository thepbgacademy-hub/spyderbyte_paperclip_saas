import type { PackageAsset, WealthFactoryPackage } from "./package-types.js";

export function createPackageAssetRegistry(assets: readonly PackageAsset[]) {
  const byId = new Map(assets.map((asset) => [asset.id, asset]));

  return {
    resolveAllowedAsset(packageDefinition: WealthFactoryPackage, assetId: string): PackageAsset {
      const asset = byId.get(assetId);
      if (!asset || asset.packageId !== packageDefinition.id || !packageDefinition.allowedAssetIds.includes(assetId)) {
        throw new Error("Asset is not allowed for this package");
      }

      return asset;
    }
  };
}
