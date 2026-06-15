import type { WealthFactoryPackage } from "./package-types.js";

export const WEALTH_FACTORY_PACKAGE_CATALOG: readonly WealthFactoryPackage[] = [
  {
    id: "pkg-example-audit",
    name: "Example Audit",
    kind: "industry",
    includedWorkflowIds: ["wf-example-audit"],
    workflowDefinitions: [
      {
        publicId: "wf-example-audit",
        publicName: "Example Audit Workflow",
        description: "Bounded example audit workflow available only through an installed package overlay.",
        allowedDeliverableTypes: ["research_brief"],
        requiredProviderCapabilities: ["text_generation"],
        boardExposureEnabled: true,
        nativeExecutionEnabled: true,
        publicDashboardEnabled: true,
        publicStartEnabled: true,
        providerKind: "openai_api"
      }
    ],
    includedEmployeeIds: ["ceo"],
    allowedAssetIds: ["asset-example-rules"],
    requiredProviderCapabilities: ["text_generation"],
    optionalProviderCapabilities: []
  }
];

export function listInstalledPackageDefinitions(input: {
  installedPackageIds: readonly string[];
  packageCatalog?: readonly WealthFactoryPackage[];
}): readonly WealthFactoryPackage[] {
  const packageCatalog = input.packageCatalog ?? WEALTH_FACTORY_PACKAGE_CATALOG;
  const installedPackageIdSet = new Set(input.installedPackageIds);
  return packageCatalog.filter((packageDefinition) => installedPackageIdSet.has(packageDefinition.id));
}

export function listNativeEnabledPackageWorkflowIds(input?: {
  packageCatalog?: readonly WealthFactoryPackage[];
}): readonly string[] {
  const packageCatalog = input?.packageCatalog ?? WEALTH_FACTORY_PACKAGE_CATALOG;
  return packageCatalog.flatMap((packageDefinition) =>
    (packageDefinition.workflowDefinitions ?? [])
      .filter(
        (workflowDefinition) =>
          packageDefinition.includedWorkflowIds.includes(workflowDefinition.publicId)
          && workflowDefinition.nativeExecutionEnabled === true
      )
      .map((workflowDefinition) => workflowDefinition.publicId)
  );
}
