import type { ProviderCapability } from "../packages/package-types.js";
import type { ExecutionEngine } from "../harness/execution-selector.js";
import { selectExecutionEngine } from "../harness/execution-selector.js";

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
  executionEngine?: ExecutionEngine;
};

export type WealthFactoryWorkflowListItem = {
  id: string;
  packageId: string;
  name: string;
  description: string;
  requiredCapabilities: readonly ProviderCapability[];
};

export const WF_HARNESS_ELIGIBLE_WORKFLOWS = ["wf_connect_first_workflow"] as const;

const BASE_WF_HARNESS_WORKFLOW_DEFINITIONS: readonly Omit<WealthFactoryWorkflowDefinition, "executionEngine">[] = [
  {
    publicId: "wf_connect_first_workflow",
    packageId: "pkg_bib_connect",
    publicName: "Connect First Workflow",
    description: "CEO-led first-workflow setup run inside the Wealth Factory harness.",
    privateMapping: {
      paperclipWorkflowId: "wf_connect_first_workflow",
      paperclipCompanyId: "wf-harness-local"
    },
    requiredCapabilities: ["text_generation"]
  }
];

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
    },

    getDefinition(publicWorkflowId: string): WealthFactoryWorkflowDefinition {
      const definition = byPublicId.get(publicWorkflowId);
      if (!definition) {
        throw new Error("Unknown Wealth Factory workflow");
      }

      return definition;
    },

    isHarnessEligible(publicWorkflowId: string): boolean {
      return byPublicId.get(publicWorkflowId)?.executionEngine === "wf_harness_v1";
    },

    listHarnessEligibleWorkflowIds(): string[] {
      return definitions.filter((definition) => definition.executionEngine === "wf_harness_v1").map((definition) => definition.publicId);
    }
  };
}

export function createHarnessWorkflowRegistry(input: { harnessEnabledWorkflowIds: readonly string[] }) {
  return createWorkflowRegistry(
    BASE_WF_HARNESS_WORKFLOW_DEFINITIONS.map((definition) => ({
      ...definition,
      executionEngine:
        selectExecutionEngine({
          workflowId: definition.publicId,
          harnessEnabledWorkflowIds: input.harnessEnabledWorkflowIds,
          harnessEligibleWorkflowIds: [...WF_HARNESS_ELIGIBLE_WORKFLOWS]
        }) === "wf_harness_v1"
          ? "wf_harness_v1"
          : "paperclip"
    }))
  );
}
