import { describe, expect, it } from "vitest";

import type { WealthFactoryPackage } from "../src/packages/package-types.js";
import {
  createHarnessWorkflowRegistry,
  createWorkflowRegistry,
  WF_BOARD_EXPOSED_WORKFLOWS,
  WF_HARNESS_ELIGIBLE_WORKFLOWS,
  WF_NATIVE_DEFAULT_WORKFLOWS
} from "../src/wealthfactory/workflow-registry.js";
import { mapRunToWealthFactorySummary } from "../src/wealthfactory/dto-mappers.js";
import { assertWealthFactoryResponse } from "../src/wealthfactory/response-guard.js";
import { toPublicWorkflowError } from "../src/wealthfactory/public-errors.js";

describe("Wealth Factory boundary layer", () => {
  it("keeps core exception workflow lists aligned across harness, native-default, and board exposure seams", () => {
    expect([...WF_HARNESS_ELIGIBLE_WORKFLOWS]).toEqual(["wf_connect_first_workflow", "wf_tax_strategy", "wf_package_followup"]);
    expect([...WF_NATIVE_DEFAULT_WORKFLOWS]).toEqual([...WF_HARNESS_ELIGIBLE_WORKFLOWS]);
    expect([...WF_BOARD_EXPOSED_WORKFLOWS]).toEqual([...WF_HARNESS_ELIGIBLE_WORKFLOWS]);
  });

  it("returns only public workflow definitions while retaining private mappings server-side", () => {
    const registry = createWorkflowRegistry([
      {
        publicId: "wf-client-ops-brief",
        packageId: "pkg-client-ops",
        publicName: "Client Ops Brief",
        description: "Prepare a bounded client-ops brief.",
        allowedDeliverableTypes: ["plan"],
        privateMapping: { paperclipWorkflowId: "pc-workflow-1", paperclipCompanyId: "pc-company-1" },
        requiredCapabilities: ["text_generation"]
      }
    ]);

    expect(registry.listPublicWorkflows()).toEqual([
      {
        id: "wf-client-ops-brief",
        packageId: "pkg-client-ops",
        name: "Client Ops Brief",
        description: "Prepare a bounded client-ops brief.",
        requiredCapabilities: ["text_generation"]
      }
    ]);
    expect(JSON.stringify(registry.listPublicWorkflows())).not.toMatch(/paperclip|pc-workflow|pc-company/i);
    expect(registry.resolvePrivateMapping("wf-client-ops-brief")).toEqual({ paperclipWorkflowId: "pc-workflow-1", paperclipCompanyId: "pc-company-1" });
    expect(registry.isHarnessEligible("wf-client-ops-brief")).toBe(false);
  });

  it("keeps harness eligibility private to the server-side workflow registry", () => {
    const registry = createWorkflowRegistry([
      {
        publicId: "wf-connect-first-workflow",
        packageId: "pkg-client-ops",
        publicName: "Connect First Workflow",
        description: "Shape the opening business run.",
        allowedDeliverableTypes: ["plan"],
        requiredCapabilities: ["text_generation"],
        executionEngine: "wf_native_v1"
      }
    ]);

    expect(registry.isHarnessEligible("wf-connect-first-workflow")).toBe(true);
    expect(registry.listHarnessEligibleWorkflowIds()).toEqual(["wf-connect-first-workflow"]);
    expect(registry.listNativeExecutorWorkflowIds()).toEqual(["wf-connect-first-workflow"]);
    expect(registry.getDefinition("wf-connect-first-workflow").privateMapping).toBeUndefined();
    expect(() => registry.resolvePrivateMapping("wf-connect-first-workflow")).toThrow(
      /Workflow does not require a private adapter mapping/
    );
    expect(registry.listPublicWorkflows()).toEqual([
      {
        id: "wf-connect-first-workflow",
        packageId: "pkg-client-ops",
        name: "Connect First Workflow",
        description: "Shape the opening business run.",
        requiredCapabilities: ["text_generation"]
      }
    ]);
  });

  it("keeps the cut-over workflow family native by default even without an explicit harness-enabled env flag", () => {
    const disabledRegistry = createHarnessWorkflowRegistry({ harnessEnabledWorkflowIds: [] });
    const enabledRegistry = createHarnessWorkflowRegistry({
      harnessEnabledWorkflowIds: ["wf_connect_first_workflow", "wf_tax_strategy", "wf_package_followup"]
    });
    const taxOnlyRegistry = createHarnessWorkflowRegistry({ harnessEnabledWorkflowIds: ["wf_tax_strategy"] });
    const packageFollowupOnlyRegistry = createHarnessWorkflowRegistry({ harnessEnabledWorkflowIds: ["wf_package_followup"] });

    expect(disabledRegistry.listPublicWorkflows()).toEqual([
      {
        id: "wf_connect_first_workflow",
        packageId: "pkg_bib_connect",
        name: "Connect First Workflow",
        description: "CEO-led first-workflow setup run inside the Wealth Factory harness.",
        requiredCapabilities: ["text_generation"]
      },
      {
        id: "wf_tax_strategy",
        packageId: "pkg_tax_strategy",
        name: "Tax Strategy Workflow",
        description: "Bounded tax strategy review run inside the Wealth Factory harness.",
        requiredCapabilities: ["text_generation"]
      },
      {
        id: "wf_package_followup",
        packageId: "pkg_package_followup",
        name: "Package Follow-up Workflow",
        description: "Bounded package follow-up run inside the Wealth Factory harness.",
        requiredCapabilities: ["text_generation"]
      }
    ]);
    expect(disabledRegistry.listHarnessEligibleWorkflowIds()).toEqual(["wf_connect_first_workflow", "wf_tax_strategy", "wf_package_followup"]);
    expect(disabledRegistry.listNativeExecutorWorkflowIds()).toEqual(["wf_connect_first_workflow", "wf_tax_strategy", "wf_package_followup"]);
    expect(disabledRegistry.listBoardExposedWorkflowIds()).toEqual([]);
    expect(disabledRegistry.listPublicWorkflows().map((workflow) => workflow.id)).toEqual([
      "wf_connect_first_workflow",
      "wf_tax_strategy",
      "wf_package_followup"
    ]);
    expect(disabledRegistry.getDefinition("wf_connect_first_workflow").executionEngine).toBe("wf_native_v1");
    expect(disabledRegistry.getDefinition("wf_tax_strategy").executionEngine).toBe("wf_native_v1");
    expect(disabledRegistry.getDefinition("wf_package_followup").executionEngine).toBe("wf_native_v1");
    expect(enabledRegistry.listHarnessEligibleWorkflowIds()).toEqual(["wf_connect_first_workflow", "wf_tax_strategy", "wf_package_followup"]);
    expect(enabledRegistry.listNativeExecutorWorkflowIds()).toEqual(["wf_connect_first_workflow", "wf_tax_strategy", "wf_package_followup"]);
    expect(enabledRegistry.listBoardExposedWorkflowIds()).toEqual([
      "wf_connect_first_workflow",
      "wf_tax_strategy",
      "wf_package_followup"
    ]);
    expect(taxOnlyRegistry.listBoardExposedWorkflowIds()).toEqual(["wf_tax_strategy"]);
    expect(enabledRegistry.getDefinition("wf_connect_first_workflow").executionEngine).toBe("wf_native_v1");
    expect(enabledRegistry.getDefinition("wf_tax_strategy").executionEngine).toBe("wf_native_v1");
    expect(enabledRegistry.getDefinition("wf_package_followup").executionEngine).toBe("wf_native_v1");
    expect(enabledRegistry.getDefinition("wf_connect_first_workflow").privateMapping).toBeUndefined();
    expect(enabledRegistry.getDefinition("wf_connect_first_workflow").packageId).toBe("pkg_bib_connect");
    expect(enabledRegistry.getDefinition("wf_tax_strategy").privateMapping).toBeUndefined();
    expect(enabledRegistry.getDefinition("wf_tax_strategy").packageId).toBe("pkg_tax_strategy");
    expect(enabledRegistry.getDefinition("wf_package_followup").privateMapping).toBeUndefined();
    expect(enabledRegistry.getDefinition("wf_package_followup").packageId).toBe("pkg_package_followup");
    expect(packageFollowupOnlyRegistry.listBoardExposedWorkflowIds()).toEqual(["wf_package_followup"]);
    expect(() => disabledRegistry.getDefinition("wf_seo_audit")).toThrow(/Unknown Wealth Factory workflow/i);
  });

  it("registers package-overlay workflows only when installed package context supplies them", () => {
    const brandSeoOverlayPackage: WealthFactoryPackage = {
      id: "pkg-brand-seo",
      name: "Brand SEO",
      kind: "industry",
      includedWorkflowIds: ["wf-seo-audit"],
      includedEmployeeIds: ["ceo"],
      allowedAssetIds: ["asset-seo-rules"],
      requiredProviderCapabilities: ["text_generation"],
      optionalProviderCapabilities: [],
      workflowDefinitions: [
        {
          publicId: "wf-seo-audit",
          publicName: "SEO Audit Workflow",
          description: "Prepare a bounded SEO audit for the installed package.",
          allowedDeliverableTypes: ["plan", "launch_copy", "research_brief"],
          requiredProviderCapabilities: ["text_generation"],
          boardExposureEnabled: true,
          nativeExecutionEnabled: true,
          publicDashboardEnabled: true,
          providerKind: "openai_api"
        }
      ]
    };

    const builtInOnlyRegistry = createHarnessWorkflowRegistry({ harnessEnabledWorkflowIds: [] });
    const overlayRegistry = createHarnessWorkflowRegistry({
      harnessEnabledWorkflowIds: ["wf-seo-audit"],
      installedPackages: [brandSeoOverlayPackage]
    });

    expect(builtInOnlyRegistry.listPublicWorkflows().map((workflow) => workflow.id)).not.toContain("wf-seo-audit");
    expect(overlayRegistry.listPublicWorkflows()).toContainEqual({
      id: "wf-seo-audit",
      packageId: "pkg-brand-seo",
      name: "SEO Audit Workflow",
      description: "Prepare a bounded SEO audit for the installed package.",
      requiredCapabilities: ["text_generation"]
    });
    expect(overlayRegistry.listPublicWorkflows().map((workflow) => workflow.id)).toEqual([
      "wf_connect_first_workflow",
      "wf_tax_strategy",
      "wf_package_followup",
      "wf-seo-audit"
    ]);
    expect(overlayRegistry.getDefinition("wf-seo-audit").executionEngine).toBe("wf_native_v1");
    expect(overlayRegistry.getDefinition("wf-seo-audit").packageId).toBe("pkg-brand-seo");
    expect(overlayRegistry.listHarnessEligibleWorkflowIds()).toEqual([
      "wf_connect_first_workflow",
      "wf_tax_strategy",
      "wf_package_followup",
      "wf-seo-audit"
    ]);
    expect(overlayRegistry.listNativeExecutorWorkflowIds()).toEqual([
      "wf_connect_first_workflow",
      "wf_tax_strategy",
      "wf_package_followup",
      "wf-seo-audit"
    ]);
    expect(overlayRegistry.listBoardExposedWorkflowIds()).toEqual(["wf-seo-audit"]);
    expect(overlayRegistry.isHarnessEligible("wf-seo-audit")).toBe(true);
    expect(overlayRegistry.listPublicDashboardWorkflowIds()).toEqual([
      "wf_connect_first_workflow",
      "wf_tax_strategy",
      "wf_package_followup",
      "wf-seo-audit"
    ]);
  });

  it("keeps installed-package overlays off the board when the package definition does not explicitly allow board exposure", () => {
    const hiddenOverlayPackage: WealthFactoryPackage = {
      id: "pkg-hidden-overlay",
      name: "Hidden Overlay Package",
      kind: "industry",
      includedWorkflowIds: ["wf-hidden-overlay"],
      includedEmployeeIds: ["ceo"],
      allowedAssetIds: [],
      requiredProviderCapabilities: ["text_generation"],
      optionalProviderCapabilities: [],
      workflowDefinitions: [
        {
          publicId: "wf-hidden-overlay",
          publicName: "Hidden Overlay Workflow",
          description: "Should remain runtime-hidden on the board unless explicitly exposed.",
          allowedDeliverableTypes: ["plan"],
          requiredProviderCapabilities: ["text_generation"],
          providerKind: "openai_api"
        }
      ]
    };

    const registry = createHarnessWorkflowRegistry({
      harnessEnabledWorkflowIds: ["wf-hidden-overlay"],
      installedPackages: [hiddenOverlayPackage]
    });

    expect(registry.listPublicWorkflows().map((workflow) => workflow.id)).toContain("wf-hidden-overlay");
    expect(registry.listBoardExposedWorkflowIds()).toEqual([]);
    expect(registry.listPublicDashboardWorkflowIds()).toEqual([
      "wf_connect_first_workflow",
      "wf_tax_strategy",
      "wf_package_followup"
    ]);
    expect(() => registry.resolveBoardWorkflowDefinition("wf-hidden-overlay")).toThrow(/Harness workflow is not enabled/i);
  });

  it("keeps public dashboard visibility separate from overlay board and native opt-ins", () => {
    const boardOnlyOverlayPackage: WealthFactoryPackage = {
      id: "pkg-board-only-overlay",
      name: "Board Only Overlay Package",
      kind: "industry",
      includedWorkflowIds: ["wf-board-only-overlay"],
      includedEmployeeIds: ["ceo"],
      allowedAssetIds: [],
      requiredProviderCapabilities: ["text_generation"],
      optionalProviderCapabilities: [],
      workflowDefinitions: [
        {
          publicId: "wf-board-only-overlay",
          publicName: "Board Only Overlay Workflow",
          description: "Visible on the board and native lane, but not on the public dashboard without its own opt-in.",
          allowedDeliverableTypes: ["plan"],
          requiredProviderCapabilities: ["text_generation"],
          boardExposureEnabled: true,
          nativeExecutionEnabled: true,
          providerKind: "openai_api"
        }
      ]
    };

    const registry = createHarnessWorkflowRegistry({
      harnessEnabledWorkflowIds: ["wf-board-only-overlay"],
      installedPackages: [boardOnlyOverlayPackage]
    });

    expect(registry.listBoardExposedWorkflowIds()).toEqual(["wf-board-only-overlay"]);
    expect(registry.listNativeExecutorWorkflowIds()).toContain("wf-board-only-overlay");
    expect(registry.listPublicDashboardWorkflowIds()).toEqual([
      "wf_connect_first_workflow",
      "wf_tax_strategy",
      "wf_package_followup"
    ]);
  });

  it("fails closed when an installed package definition is not included in that package workflow list", () => {
    const excludedOverlayPackage: WealthFactoryPackage = {
      id: "pkg-overlay-mismatch",
      name: "Overlay Mismatch Package",
      kind: "industry",
      includedWorkflowIds: [],
      includedEmployeeIds: ["ceo"],
      allowedAssetIds: [],
      requiredProviderCapabilities: ["text_generation"],
      optionalProviderCapabilities: [],
      workflowDefinitions: [
        {
          publicId: "wf-overlay-should-stay-hidden",
          publicName: "Hidden Overlay Workflow",
          description: "This should never register unless the package explicitly includes it.",
          allowedDeliverableTypes: ["plan"],
          requiredProviderCapabilities: ["text_generation"]
        }
      ]
    };

    const registry = createHarnessWorkflowRegistry({
      harnessEnabledWorkflowIds: ["wf-overlay-should-stay-hidden"],
      installedPackages: [excludedOverlayPackage]
    });

    expect(registry.listPublicWorkflows().map((workflow) => workflow.id)).not.toContain("wf-overlay-should-stay-hidden");
    expect(() => registry.getDefinition("wf-overlay-should-stay-hidden")).toThrow(/Unknown Wealth Factory workflow/i);
  });

  it("fails closed when a package overlay tries to override a built-in workflow id", () => {
    const invalidOverlayPackage: WealthFactoryPackage = {
      id: "pkg-invalid",
      name: "Invalid Package",
      kind: "industry",
      includedWorkflowIds: ["wf_tax_strategy"],
      includedEmployeeIds: ["ceo"],
      allowedAssetIds: [],
      requiredProviderCapabilities: ["text_generation"],
      optionalProviderCapabilities: [],
      workflowDefinitions: [
        {
          publicId: "wf_tax_strategy",
          publicName: "Tax Strategy Override",
          description: "This should never override the built-in workflow.",
          allowedDeliverableTypes: ["tax_strategy_review"],
          requiredProviderCapabilities: ["text_generation"]
        }
      ]
    };

    expect(() =>
      createHarnessWorkflowRegistry({
        harnessEnabledWorkflowIds: [],
        installedPackages: [invalidOverlayPackage]
      })
    ).toThrow(/Duplicate Wealth Factory workflow id/i);
  });

  it("maps internal run records to Wealth Factory DTOs and blocks forbidden fields", () => {
    const dto = mapRunToWealthFactorySummary({
      runId: "run-1",
      workflowId: "wf-client-ops-brief",
      workflowName: "Client Ops Brief",
      status: "queued",
      internal: { paperclipRunId: "pc-run-1", prompt: "hidden" }
    });

    expect(dto).toEqual({
      runId: "run-1",
      workflowId: "wf-client-ops-brief",
      workflowName: "Client Ops Brief",
      status: "queued"
    });
    expect(() => assertWealthFactoryResponse({ ...dto, prompt: "leak" })).toThrow("Forbidden customer-facing field");
    expect(() => assertWealthFactoryResponse({ ...dto, paperclip_run_id: "leak" })).toThrow("Forbidden customer-facing field");
    expect(() => assertWealthFactoryResponse({ ...dto, secret_ref: "leak" })).toThrow("Forbidden customer-facing field");
    expect(() => assertWealthFactoryResponse({ ...dto, authStateRef: "leak" })).toThrow("Forbidden customer-facing field");
  });

  it("blocks secret-like values under harmless field names", () => {
    expect(() => assertWealthFactoryResponse({ note: "Bearer should-not-be-public" })).toThrow("Forbidden customer-facing text");
    expect(() => assertWealthFactoryResponse({ note: "wf_secret_should_not_be_public" })).toThrow("Forbidden customer-facing text");
    expect(() => assertWealthFactoryResponse({ url: "https://example.test/export?access_token=hidden" })).toThrow(
      "Forbidden customer-facing text"
    );
  });

  it("translates internal errors to public Wealth Factory errors", () => {
    expect(toPublicWorkflowError({ code: "paperclip_disabled" })).toEqual({ code: "tenant_paused" });
    expect(toPublicWorkflowError(new Error("prompt stack trace"))).toEqual({ code: "workflow_failed" });
  });
});
