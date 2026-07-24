import { readFileSync } from "node:fs";
import path from "node:path";

import { FactoryPackageInstallApiError } from "./factory-package-install-api.js";
import { loadBlueprintPackageManifest, type BlueprintManifestV1 } from "../factory/packages/package-manifest-loader.js";
import type { BlueprintPackageDefinition } from "../factory/domain/types.js";

const ALLOWED_DEMO_PACKAGE_KEYS = new Set(["local-service-launch", "solo-consultant-positioning"]);

/**
 * MVP blueprint resolution for the mounted install route: packageKey ->
 * shipped demo-package manifest on disk (DEC-039). The allowlist both
 * selects the manifest file and prevents path traversal -- any key not in
 * the set is rejected before it ever reaches the filesystem.
 */
export function createDemoPackageBlueprintLoader(options: { demoPackagesRoot?: string } = {}) {
  const demoPackagesRoot = options.demoPackagesRoot ?? path.resolve(process.cwd(), "demo-packages");

  return async function loadBlueprintPackage(input: { packageKey: string }): Promise<BlueprintPackageDefinition> {
    if (!ALLOWED_DEMO_PACKAGE_KEYS.has(input.packageKey)) {
      throw new FactoryPackageInstallApiError("invalid_request", `Unknown blueprint package key "${input.packageKey}"`);
    }

    const manifestPath = path.join(demoPackagesRoot, input.packageKey, "manifest.json");
    let manifestText: string;
    try {
      manifestText = readFileSync(manifestPath, "utf8");
    } catch {
      throw new FactoryPackageInstallApiError(
        "invalid_request",
        `Blueprint manifest not found for package "${input.packageKey}"`
      );
    }

    const manifest = JSON.parse(manifestText) as BlueprintManifestV1;
    return loadBlueprintPackageManifest(manifest);
  };
}
