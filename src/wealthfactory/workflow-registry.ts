import type { ProviderCapability, WealthFactoryPackage } from "../packages/package-types.js";
import type { ExecutionEngine } from "../harness/execution-selector.js";
import { selectExecutionEngine } from "../harness/execution-selector.js";
import type { HarnessDeliverableType } from "../harness/types.js";
import type { ProviderKind } from "../providers/provider-types.js";

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
  publicDashboardEnabled?: boolean;
  publicStartEnabled?: boolean;
  providerKind?: ProviderKind;
};

export type WealthFactoryWorkflowListItem = {
  id: string;
  packageId: string;
  name: string;
  description: string;
  requiredCapabilities: readonly ProviderCapability[];
  startEnabled?: boolean;
};

const WF_CORE_BUILTIN_EXCEPTION_WORKFLOWS = ["wf_connect_first_workflow", "wf_tax_strategy", "wf_package_followup"] as const;
export const WF_HARNESS_ELIGIBLE_WORKFLOWS = WF_CORE_BUILTIN_EXCEPTION_WORKFLOWS;
export const WF_NATIVE_DEFAULT_WORKFLOWS = WF_CORE_BUILTIN_EXCEPTION_WORKFLOWS;
export const WF_BOARD_EXPOSED_WORKFLOWS = WF_CORE_BUILTIN_EXCEPTION_WORKFLOWS;
const WORKFLOW_BOUNDARY_KIND = Symbol("workflowBoundaryKind");
type WorkflowBoundaryKind = "core_builtin_exception" | "installed_package_overlay";
type InternalWorkflowBoundaryDefinition = Omit<WealthFactoryWorkflowDefinition, "executionEngine"> & {
  [WORKFLOW_BOUNDARY_KIND]: WorkflowBoundaryKind;
  overlayBoardExposureEnabled?: boolean;
  overlayNativeExecutionEnabled?: boolean;
  overlayPublicDashboardEnabled?: boolean;
  overlayPublicStartEnabled?: boolean;
};
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
const WF_PACKAGE_FOLLOWUP_WORKFLOW_DELIVERABLE_TYPES = [
  "launch_copy",
  "research_brief",
  "forecast_model"
] as const satisfies readonly HarnessDeliverableType[];

const BASE_WF_HARNESS_WORKFLOW_DEFINITIONS: readonly InternalWorkflowBoundaryDefinition[] = [
  {
    publicId: "wf_connect_first_workflow",
    packageId: "pkg_bib_connect",
    publicName: "Connect First Workflow",
    description: "CEO-led first-workflow setup run inside the Wealth Factory harness.",
    allowedDeliverableTypes: WF_CONNECT_FIRST_WORKFLOW_DELIVERABLE_TYPES,
    requiredCapabilities: ["text_generation"],
    publicDashboardEnabled: true,
    publicStartEnabled: true,
    [WORKFLOW_BOUNDARY_KIND]: "core_builtin_exception"
  },
  {
    publicId: "wf_tax_strategy",
    packageId: "pkg_tax_strategy",
    publicName: "Tax Strategy Workflow",
    description: "Bounded tax strategy review run inside the Wealth Factory harness.",
    allowedDeliverableTypes: WF_TAX_STRATEGY_WORKFLOW_DELIVERABLE_TYPES,
    requiredCapabilities: ["text_generation"],
    publicDashboardEnabled: true,
    publicStartEnabled: true,
    [WORKFLOW_BOUNDARY_KIND]: "core_builtin_exception"
  },
  {
    publicId: "wf_package_followup",
    packageId: "pkg_package_followup",
    publicName: "Package Follow-up Workflow",
    description: "Bounded package follow-up run inside the Wealth Factory harness.",
    allowedDeliverableTypes: WF_PACKAGE_FOLLOWUP_WORKFLOW_DELIVERABLE_TYPES,
    requiredCapabilities: ["text_generation"],
    publicDashboardEnabled: true,
    publicStartEnabled: true,
    [WORKFLOW_BOUNDARY_KIND]: "core_builtin_exception"
  }
];

function createPackageOverlayWorkflowDefinitions(packages: readonly WealthFactoryPackage[]): readonly InternalWorkflowBoundaryDefinition[] {
  return packages.flatMap((packageDefinition) =>
    (packageDefinition.workflowDefinitions ?? [])
      .filter((workflowDefinition) => packageDefinition.includedWorkflowIds.includes(workflowDefinition.publicId))
      .map((workflowDefinition) => ({
        publicId: workflowDefinition.publicId,
        packageId: packageDefinition.id,
        publicName: workflowDefinition.publicName,
        description: workflowDefinition.description,
        allowedDeliverableTypes: workflowDefinition.allowedDeliverableTypes,
        requiredCapabilities: workflowDefinition.requiredProviderCapabilities,
        overlayBoardExposureEnabled: workflowDefinition.boardExposureEnabled === true,
        overlayNativeExecutionEnabled: workflowDefinition.nativeExecutionEnabled === true,
        overlayPublicDashboardEnabled: workflowDefinition.publicDashboardEnabled === true,
        overlayPublicStartEnabled: workflowDefinition.publicStartEnabled === true,
        ...(workflowDefinition.providerKind ? { providerKind: workflowDefinition.providerKind } : {}),
        [WORKFLOW_BOUNDARY_KIND]: "installed_package_overlay"
      }))
  );
}

function assertUniqueWorkflowIds(definitions: readonly Pick<WealthFactoryWorkflowDefinition, "publicId">[]) {
  const seen = new Set<string>();

  for (const definition of definitions) {
    if (seen.has(definition.publicId)) {
      throw new Error(`Duplicate Wealth Factory workflow id: ${definition.publicId}`);
    }
    seen.add(definition.publicId);
  }
}

function assertWorkflowBoundaryKinds(definitions: readonly InternalWorkflowBoundaryDefinition[]) {
  for (const definition of definitions) {
    const boundaryKind = definition[WORKFLOW_BOUNDARY_KIND];
    if (boundaryKind === "core_builtin_exception") {
      if (!WF_CORE_BUILTIN_EXCEPTION_WORKFLOWS.includes(definition.publicId as (typeof WF_CORE_BUILTIN_EXCEPTION_WORKFLOWS)[number])) {
        throw new Error(`Built-in Wealth Factory workflow is missing core exception registration: ${definition.publicId}`);
      }
      continue;
    }

    if (WF_CORE_BUILTIN_EXCEPTION_WORKFLOWS.includes(definition.publicId as (typeof WF_CORE_BUILTIN_EXCEPTION_WORKFLOWS)[number])) {
      throw new Error(`Installed package overlay cannot reuse core exception workflow id: ${definition.publicId}`);
    }
  }
}

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

    listPublicDashboardWorkflowIds(): string[] {
      return definitions
        .filter((definition) => definition.publicDashboardEnabled === true)
        .map((definition) => definition.publicId);
    },

    listPublicDashboardWorkflows(): WealthFactoryWorkflowListItem[] {
      return definitions
        .filter((definition) => definition.publicDashboardEnabled === true)
        .map((definition) => ({
          id: definition.publicId,
          packageId: definition.packageId,
          name: definition.publicName,
          description: definition.description,
          requiredCapabilities: definition.requiredCapabilities,
          startEnabled: definition.publicStartEnabled === true
        }));
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
  installedPackages?: readonly WealthFactoryPackage[];
}) {
  const allDefinitions = [
    ...BASE_WF_HARNESS_WORKFLOW_DEFINITIONS,
    ...createPackageOverlayWorkflowDefinitions(input.installedPackages ?? [])
  ] as const;
  assertUniqueWorkflowIds(allDefinitions);
  assertWorkflowBoundaryKinds(allDefinitions);
  const boardExposedWorkflowIds = new Set(
    allDefinitions
      .filter((definition) =>
        input.harnessEnabledWorkflowIds.includes(definition.publicId)
        && (
          definition[WORKFLOW_BOUNDARY_KIND] === "core_builtin_exception"
          || definition.overlayBoardExposureEnabled === true
        )
      )
      .map((definition) => definition.publicId)
  );
  const publicDashboardWorkflowIds = new Set(
    allDefinitions
      .filter((definition) =>
        definition[WORKFLOW_BOUNDARY_KIND] === "core_builtin_exception"
        || definition.overlayPublicDashboardEnabled === true
      )
      .map((definition) => definition.publicId)
  );
  const publicStartWorkflowIds = new Set(
    allDefinitions
      .filter((definition) =>
        definition[WORKFLOW_BOUNDARY_KIND] === "core_builtin_exception"
        || definition.overlayPublicStartEnabled === true
      )
      .map((definition) => definition.publicId)
  );
  const overlayNativeWorkflowIds = allDefinitions
    .filter((definition) => definition[WORKFLOW_BOUNDARY_KIND] === "installed_package_overlay" && definition.overlayNativeExecutionEnabled === true)
    .map((definition) => definition.publicId);
  const harnessEligibleWorkflowIds = [...new Set([...WF_HARNESS_ELIGIBLE_WORKFLOWS, ...overlayNativeWorkflowIds])];
  const nativeDefaultWorkflowIds = [...new Set([...(input.nativeDefaultWorkflowIds ?? [...WF_NATIVE_DEFAULT_WORKFLOWS]), ...overlayNativeWorkflowIds])];
  const executionEnabledWorkflowIds = [...new Set([...(input.harnessEnabledWorkflowIds ?? []), ...nativeDefaultWorkflowIds])];

  return createWorkflowRegistry(
    allDefinitions.map((definition) => ({
      ...definition,
      boardExposureEnabled: boardExposedWorkflowIds.has(definition.publicId),
      publicDashboardEnabled: publicDashboardWorkflowIds.has(definition.publicId),
      publicStartEnabled: publicStartWorkflowIds.has(definition.publicId),
      executionEngine: selectExecutionEngine({
        workflowId: definition.publicId,
        harnessEnabledWorkflowIds: executionEnabledWorkflowIds,
        nativeExecutorEnabledWorkflowIds: input.nativeExecutorEnabledWorkflowIds ?? [],
        harnessEligibleWorkflowIds,
        nativeDefaultWorkflowIds
      })
    }))
  );
}
