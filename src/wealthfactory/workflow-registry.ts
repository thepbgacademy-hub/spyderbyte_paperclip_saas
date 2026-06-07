import type { ProviderCapability } from "../packages/package-types.js";
import type { ExecutionEngine } from "../harness/execution-selector.js";
import { selectExecutionEngine } from "../harness/execution-selector.js";
import type { HarnessDeliverableType } from "../harness/types.js";

export type PrivateWorkflowMapping = {
  paperclipWorkflowId: string;
  paperclipCompanyId: string;
};

export type WealthFactoryWorkflowDefinition = {
  publicId: string;
  packageId: string;
  publicName: string;
  description: string;
  allowedDeliverableTypes: readonly HarnessDeliverableType[];
  privateMapping?: PrivateWorkflowMapping;
  requiredCapabilities: readonly ProviderCapability[];
  executionEngine?: ExecutionEngine;
  boardExposureEnabled?: boolean;
};

export type WealthFactoryWorkflowListItem = {
  id: string;
  packageId: string;
  name: string;
  description: string;
  requiredCapabilities: readonly ProviderCapability[];
};

export const WF_HARNESS_ELIGIBLE_WORKFLOWS = ["wf_connect_first_workflow", "wf_tax_strategy"] as const;
export const WF_NATIVE_DEFAULT_WORKFLOWS = ["wf_connect_first_workflow", "wf_tax_strategy"] as const;
export const WF_BOARD_EXPOSED_WORKFLOWS = ["wf_connect_first_workflow", "wf_tax_strategy"] as const;
const WF_CONNECT_FIRST_WORKFLOW_DELIVERABLE_TYPES = [
  "plan",
  "pricing_review",
  "research_brief",
  "ops_handoff",
  "technical_review",
  "launch_copy",
  "forecast_model",
  "finance_review",
  "legal_review"
] as const satisfies readonly HarnessDeliverableType[];
const WF_TAX_STRATEGY_WORKFLOW_DELIVERABLE_TYPES = ["tax_strategy_review"] as const satisfies readonly HarnessDeliverableType[];

const BASE_WF_HARNESS_WORKFLOW_DEFINITIONS: readonly Omit<WealthFactoryWorkflowDefinition, "executionEngine">[] = [
  {
    publicId: "wf_connect_first_workflow",
    packageId: "pkg_bib_connect",
    publicName: "Connect First Workflow",
    description: "CEO-led first-workflow setup run inside the Wealth Factory harness.",
    allowedDeliverableTypes: WF_CONNECT_FIRST_WORKFLOW_DELIVERABLE_TYPES,
    requiredCapabilities: ["text_generation"]
  },
  {
    publicId: "wf_tax_strategy",
    packageId: "pkg_tax_strategy",
    publicName: "Tax Strategy Workflow",
    description: "Bounded tax strategy review run inside the Wealth Factory harness.",
    allowedDeliverableTypes: WF_TAX_STRATEGY_WORKFLOW_DELIVERABLE_TYPES,
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
      if (!definition.privateMapping) {
        throw new Error("Workflow does not require a private adapter mapping");
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
      const executionEngine = byPublicId.get(publicWorkflowId)?.executionEngine;
      return executionEngine !== undefined && executionEngine !== "paperclip";
    },

    listHarnessEligibleWorkflowIds(): string[] {
      return definitions
        .filter((definition) => definition.executionEngine !== undefined && definition.executionEngine !== "paperclip")
        .map((definition) => definition.publicId);
    },

    listBoardExposedWorkflowIds(): string[] {
      return definitions
        .filter((definition) => definition.boardExposureEnabled === true)
        .map((definition) => definition.publicId);
    },

    resolveBoardWorkflowDefinition(publicWorkflowId?: string): WealthFactoryWorkflowDefinition {
      const boardExposedWorkflowIds = definitions
        .filter((definition) => definition.boardExposureEnabled === true)
        .map((definition) => definition.publicId);

      if (boardExposedWorkflowIds.length === 0) {
        throw new Error("Harness workflow is not enabled");
      }

      if (publicWorkflowId) {
        if (!boardExposedWorkflowIds.includes(publicWorkflowId)) {
          throw new Error("Harness workflow is not enabled");
        }
        return byPublicId.get(publicWorkflowId)!;
      }

      if (boardExposedWorkflowIds.length > 1) {
        throw new Error("Harness workflow selector is ambiguous");
      }

      return byPublicId.get(boardExposedWorkflowIds[0]!)!;
    },

    listNativeExecutorWorkflowIds(): string[] {
      return definitions.filter((definition) => definition.executionEngine === "wf_native_v1").map((definition) => definition.publicId);
    }
  };
}

export function createHarnessWorkflowRegistry(input: {
  harnessEnabledWorkflowIds: readonly string[];
  nativeExecutorEnabledWorkflowIds?: readonly string[];
  nativeDefaultWorkflowIds?: readonly string[];
}) {
  const boardEligibleWorkflowIds = new Set<string>(WF_BOARD_EXPOSED_WORKFLOWS);
  const boardExposedWorkflowIds = new Set(input.harnessEnabledWorkflowIds.filter((workflowId) => boardEligibleWorkflowIds.has(workflowId)));
  const executionEnabledWorkflowIds = [...new Set([...(input.harnessEnabledWorkflowIds ?? []), ...(input.nativeDefaultWorkflowIds ?? [...WF_NATIVE_DEFAULT_WORKFLOWS])])];

  return createWorkflowRegistry(
    BASE_WF_HARNESS_WORKFLOW_DEFINITIONS.map((definition) => ({
      ...definition,
      boardExposureEnabled: boardExposedWorkflowIds.has(definition.publicId),
      executionEngine: selectExecutionEngine({
        workflowId: definition.publicId,
        harnessEnabledWorkflowIds: executionEnabledWorkflowIds,
        nativeExecutorEnabledWorkflowIds: input.nativeExecutorEnabledWorkflowIds ?? [],
        harnessEligibleWorkflowIds: [...WF_HARNESS_ELIGIBLE_WORKFLOWS],
        nativeDefaultWorkflowIds: input.nativeDefaultWorkflowIds ?? [...WF_NATIVE_DEFAULT_WORKFLOWS]
      })
    }))
  );
}
