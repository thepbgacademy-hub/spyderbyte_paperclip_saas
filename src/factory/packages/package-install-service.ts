import type { BlueprintPackageDefinition, PackageInstall } from "../domain/types.js";

export function installBlueprintPackage(input: {
  id: string;
  workspaceId: string;
  blueprint: BlueprintPackageDefinition;
  installedAt: string;
}): PackageInstall {
  return {
    id: input.id,
    workspaceId: input.workspaceId,
    packageId: input.blueprint.id,
    installedAt: input.installedAt,
    enabled: true
  };
}
