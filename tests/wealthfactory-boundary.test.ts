import { describe, expect, it } from "vitest";

import { createHarnessWorkflowRegistry, createWorkflowRegistry } from "../src/wealthfactory/workflow-registry.js";
import { mapRunToWealthFactorySummary } from "../src/wealthfactory/dto-mappers.js";
import { assertWealthFactoryResponse } from "../src/wealthfactory/response-guard.js";
import { toPublicWorkflowError } from "../src/wealthfactory/public-errors.js";

describe("Wealth Factory boundary layer", () => {
  it("returns only public workflow definitions while retaining private mappings server-side", () => {
    const registry = createWorkflowRegistry([
      {
        publicId: "wf-social-calendar",
        packageId: "pkg-social",
        publicName: "Wealth Factory Social Calendar",
        description: "Plan a week of social posts.",
        privateMapping: { paperclipWorkflowId: "pc-workflow-1", paperclipCompanyId: "pc-company-1" },
        requiredCapabilities: ["text_generation"]
      }
    ]);

    expect(registry.listPublicWorkflows()).toEqual([
      {
        id: "wf-social-calendar",
        packageId: "pkg-social",
        name: "Wealth Factory Social Calendar",
        description: "Plan a week of social posts.",
        requiredCapabilities: ["text_generation"]
      }
    ]);
    expect(JSON.stringify(registry.listPublicWorkflows())).not.toMatch(/paperclip|pc-workflow|pc-company/i);
    expect(registry.resolvePrivateMapping("wf-social-calendar")).toEqual({ paperclipWorkflowId: "pc-workflow-1", paperclipCompanyId: "pc-company-1" });
    expect(registry.isHarnessEligible("wf-social-calendar")).toBe(false);
  });

  it("keeps harness eligibility private to the server-side workflow registry", () => {
    const registry = createWorkflowRegistry([
      {
        publicId: "wf-connect-first-workflow",
        packageId: "pkg-social",
        publicName: "Connect First Workflow",
        description: "Shape the opening business run.",
        privateMapping: { paperclipWorkflowId: "pc-workflow-2", paperclipCompanyId: "pc-company-2" },
        requiredCapabilities: ["text_generation"],
        executionEngine: "wf_harness_v1"
      }
    ]);

    expect(registry.isHarnessEligible("wf-connect-first-workflow")).toBe(true);
    expect(registry.listHarnessEligibleWorkflowIds()).toEqual(["wf-connect-first-workflow"]);
    expect(registry.listPublicWorkflows()).toEqual([
      {
        id: "wf-connect-first-workflow",
        packageId: "pkg-social",
        name: "Connect First Workflow",
        description: "Shape the opening business run.",
        requiredCapabilities: ["text_generation"]
      }
    ]);
  });

  it("uses enabled workflow ids to expose only the harness slice that is actually routed there", () => {
    const disabledRegistry = createHarnessWorkflowRegistry({ harnessEnabledWorkflowIds: [] });
    const enabledRegistry = createHarnessWorkflowRegistry({ harnessEnabledWorkflowIds: ["wf_connect_first_workflow"] });

    expect(disabledRegistry.listHarnessEligibleWorkflowIds()).toEqual([]);
    expect(enabledRegistry.listHarnessEligibleWorkflowIds()).toEqual(["wf_connect_first_workflow"]);
    expect(enabledRegistry.getDefinition("wf_connect_first_workflow").packageId).toBe("pkg_bib_connect");
  });

  it("maps internal run records to Wealth Factory DTOs and blocks forbidden fields", () => {
    const dto = mapRunToWealthFactorySummary({
      runId: "run-1",
      workflowId: "wf-social-calendar",
      workflowName: "Wealth Factory Social Calendar",
      status: "queued",
      internal: { paperclipRunId: "pc-run-1", prompt: "hidden" }
    });

    expect(dto).toEqual({
      runId: "run-1",
      workflowId: "wf-social-calendar",
      workflowName: "Wealth Factory Social Calendar",
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
