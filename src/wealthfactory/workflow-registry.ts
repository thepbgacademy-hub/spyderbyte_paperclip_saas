import type { ProviderCapability } from "../packages/package-types.js";

export type PrivateWorkflowMapping = {
  paperclipWorkflowId: string;
  paperclipCompanyId: string;
};

export type WealthFactoryWorkflowDefinition = {
  publicId: string;
  packageId: string;
  publicName: string;
  description: string;
  privateMapping: PrivateWorkflowMapping;
  requiredCapabilities: readonly ProviderCapability[];
};

export type WealthFactoryWorkflowListItem = {
  id: string;
  packageId: string;
  name: string;
  description: string;
  requiredCapabilities: readonly ProviderCapability[];
};

export function createWorkflowRegistry(definitions: readonly WealthFactoryWorkflowDefinition[]) {
  const byPublicId = new Map(definitions.map((definition) => [definition.publicId, definition]));

  return {
    listPublicWorkflows(): WealthFactoryWorkflowListItem[] {
      return definitions.map((definition) => ({
        id: definition.publicId,
        packageId: definition.packageId,
        name: definition.publicName,
        description: definition.description,
        requiredCapabilities: definition.requiredCapabilities
      }));
    },

    resolvePrivateMapping(publicWorkflowId: string): PrivateWorkflowMapping {
      const definition = byPublicId.get(publicWorkflowId);
      if (!definition) {
        throw new Error("Unknown Wealth Factory workflow");
      }

      return definition.privateMapping;
    }
  };
}
