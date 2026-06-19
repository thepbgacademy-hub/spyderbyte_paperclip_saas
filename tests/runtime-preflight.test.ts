import { describe, expect, it } from "vitest";

import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { loadRuntimePreflight, summarizeRuntimePreflight } = require("../scripts/lib/runtime-preflight.mjs");

describe("runtime preflight", () => {
  it("flags missing bound-provider and purchase schema as blockers", async () => {
    const responses = [
      { rows: [{ column_name: "id" }, { column_name: "status" }] },
      { rows: [{ column_name: "id" }, { column_name: "status" }] },
      { rows: [{ has_single_provider_bound_context_guard: false, has_bound_provider_binding_shape_guard: false, has_single_active_provider_lane_guard: false }] },
      { rows: [{ has_outbox: true, has_company_mapping: true }] },
      { rows: [{ id: "tenant-1", paused_at: null }] },
      { rows: [{ id: "workflow-1", tenant_id: "tenant-1", enabled: true, provider_kind: "openai_api", package_id: "package-1" }] },
      { rows: [] }
    ];
    const client = {
      query: async () => responses.shift() ?? { rows: [] }
    };

    const preflight = await loadRuntimePreflight({
      client,
      tenantId: "tenant-1",
      workflowId: "workflow-1"
    });
    const summary = summarizeRuntimePreflight(preflight);

    expect(summary.ok).toBe(false);
    expect(summary.blockers).toContain("workflow_runs is missing bound provider context columns from the latest repo migrations");
    expect(summary.blockers).toContain("workflow_runs is missing the single-provider bound context guard from the latest repo migrations");
    expect(summary.blockers).toContain("workflow_runs is missing the bound secret/context shape guard from the latest repo migrations");
    expect(summary.blockers).toContain("secret_references is missing the single-active provider lane guard from the latest repo migrations");
    expect(summary.blockers).toContain("tenant_package_purchases is missing the purchaser column expected by the live-drive seed path");
    expect(preflight.schema.purchaseActorColumn).toBe(null);
  });

  it("returns a blocker instead of throwing when the mapping table is absent", async () => {
    const responses = [
      { rows: [{ column_name: "id" }, { column_name: "bound_secret_reference_id" }, { column_name: "bound_provider_context" }] },
      { rows: [{ column_name: "id" }, { column_name: "purchased_by_user_id" }] },
      { rows: [{ has_single_provider_bound_context_guard: true, has_bound_provider_binding_shape_guard: true, has_single_active_provider_lane_guard: true }] },
      { rows: [{ has_outbox: true, has_company_mapping: false }] },
      { rows: [{ id: "tenant-1", paused_at: null }] },
      { rows: [{ id: "workflow-1", tenant_id: "tenant-1", enabled: true, provider_kind: "openai_api", package_id: "package-1" }] }
    ];
    const client = {
      query: async () => responses.shift() ?? { rows: [] }
    };

    const preflight = await loadRuntimePreflight({
      client,
      tenantId: "tenant-1",
      workflowId: "workflow-1"
    });
    const summary = summarizeRuntimePreflight(preflight);

    expect(summary.ok).toBe(false);
    expect(summary.blockers).toContain("paperclip_company_mappings table is missing");
    expect(preflight.mapping).toEqual({
      exists: false,
      paperclipCompanyId: null,
      paperclipIssueAgentId: null
    });
  });

  it("passes when the runtime shape is ready", async () => {
    const responses = [
      { rows: [{ column_name: "id" }, { column_name: "bound_secret_reference_id" }, { column_name: "bound_provider_context" }] },
      { rows: [{ column_name: "id" }, { column_name: "purchased_by_user_id" }] },
      { rows: [{ has_single_provider_bound_context_guard: true, has_bound_provider_binding_shape_guard: true, has_single_active_provider_lane_guard: true }] },
      { rows: [{ has_outbox: true, has_company_mapping: true }] },
      { rows: [{ id: "tenant-1", paused_at: null }] },
      { rows: [{ id: "workflow-1", tenant_id: "tenant-1", enabled: true, provider_kind: "openai_api", package_id: "package-1" }] },
      { rows: [{ tenant_id: "tenant-1", paperclip_company_id: "pc-company-1" }] }
    ];
    const client = {
      query: async () => responses.shift() ?? { rows: [] }
    };

    const preflight = await loadRuntimePreflight({
      client,
      tenantId: "tenant-1",
      workflowId: "workflow-1"
    });
    const summary = summarizeRuntimePreflight(preflight);

    expect(summary).toEqual({
      ok: true,
      blockers: []
    });
    expect(preflight.schema.purchaseActorColumn).toBe("purchased_by_user_id");
  });

  it("flags missing single-provider seam guards even when the bound-provider columns exist", async () => {
    const responses = [
      { rows: [{ column_name: "id" }, { column_name: "bound_secret_reference_id" }, { column_name: "bound_provider_context" }] },
      { rows: [{ column_name: "id" }, { column_name: "purchased_by_user_id" }] },
      { rows: [{ has_single_provider_bound_context_guard: false, has_bound_provider_binding_shape_guard: true, has_single_active_provider_lane_guard: true }] },
      { rows: [{ has_outbox: true, has_company_mapping: true }] },
      { rows: [{ id: "tenant-1", paused_at: null }] },
      { rows: [{ id: "workflow-1", tenant_id: "tenant-1", enabled: true, provider_kind: "openai_api", package_id: "package-1" }] },
      { rows: [{ tenant_id: "tenant-1", paperclip_company_id: "pc-company-1" }] }
    ];
    const client = {
      query: async () => responses.shift() ?? { rows: [] }
    };

    const preflight = await loadRuntimePreflight({
      client,
      tenantId: "tenant-1",
      workflowId: "workflow-1"
    });
    const summary = summarizeRuntimePreflight(preflight);

    expect(summary.ok).toBe(false);
    expect(summary.blockers).toContain("workflow_runs is missing the single-provider bound context guard from the latest repo migrations");
    expect(summary.blockers).not.toContain("workflow_runs is missing bound provider context columns from the latest repo migrations");
  });

  it("flags missing bound secret/context shape guards even when the single-entry guard exists", async () => {
    const responses = [
      { rows: [{ column_name: "id" }, { column_name: "bound_secret_reference_id" }, { column_name: "bound_provider_context" }] },
      { rows: [{ column_name: "id" }, { column_name: "purchased_by_user_id" }] },
      { rows: [{ has_single_provider_bound_context_guard: true, has_bound_provider_binding_shape_guard: false, has_single_active_provider_lane_guard: true }] },
      { rows: [{ has_outbox: true, has_company_mapping: true }] },
      { rows: [{ id: "tenant-1", paused_at: null }] },
      { rows: [{ id: "workflow-1", tenant_id: "tenant-1", enabled: true, provider_kind: "openai_api", package_id: "package-1" }] },
      { rows: [{ tenant_id: "tenant-1", paperclip_company_id: "pc-company-1" }] }
    ];
    const client = {
      query: async () => responses.shift() ?? { rows: [] }
    };

    const preflight = await loadRuntimePreflight({
      client,
      tenantId: "tenant-1",
      workflowId: "workflow-1"
    });
    const summary = summarizeRuntimePreflight(preflight);

    expect(summary.ok).toBe(false);
    expect(summary.blockers).toContain("workflow_runs is missing the bound secret/context shape guard from the latest repo migrations");
    expect(summary.blockers).not.toContain("workflow_runs is missing the single-provider bound context guard from the latest repo migrations");
  });

  it("uses case-insensitive constraint definition checks so postgres formatting does not false-fail live preflight", async () => {
    const responses = [
      { rows: [{ column_name: "id" }, { column_name: "bound_secret_reference_id" }, { column_name: "bound_provider_context" }] },
      { rows: [{ column_name: "id" }, { column_name: "purchased_by_user_id" }] },
      { rows: [{ has_single_provider_bound_context_guard: true, has_bound_provider_binding_shape_guard: true, has_single_active_provider_lane_guard: true }] },
      { rows: [{ has_outbox: true, has_company_mapping: true }] },
      { rows: [{ id: "tenant-1", paused_at: null }] },
      { rows: [{ id: "workflow-1", tenant_id: "tenant-1", enabled: true, provider_kind: "openai_api", package_id: "package-1" }] },
      { rows: [{ tenant_id: "tenant-1", paperclip_company_id: "pc-company-1" }] }
    ];
    const queries: string[] = [];
    const client = {
      query: async (sql: string) => {
        queries.push(String(sql));
        return responses.shift() ?? { rows: [] };
      }
    };

    await loadRuntimePreflight({
      client,
      tenantId: "tenant-1",
      workflowId: "workflow-1"
    });

    const guardQuery = queries[2] ?? "";
    expect(guardQuery).toContain("lower(pg_get_constraintdef(oid))");
    expect(guardQuery).toContain("like '%bound_secret_reference_id is null%'");
    expect(guardQuery).toContain("like '%jsonb_array_length(bound_provider_context) <= 1%'");
  });

  it("falls back to the tenant's latest workflow template when a stale proof caller passes a public workflow id", async () => {
    const responses = [
      { rows: [{ column_name: "id" }, { column_name: "bound_secret_reference_id" }, { column_name: "bound_provider_context" }] },
      { rows: [{ column_name: "id" }, { column_name: "purchased_by_user_id" }] },
      { rows: [{ has_single_provider_bound_context_guard: true, has_bound_provider_binding_shape_guard: true, has_single_active_provider_lane_guard: true }] },
      { rows: [{ has_outbox: true, has_company_mapping: true }] },
      { rows: [{ id: "tenant-1", paused_at: null }] },
      { rows: [{ id: "workflow-uuid-1", tenant_id: "tenant-1", enabled: true, provider_kind: "openai_api", package_id: "package-1" }] },
      { rows: [{ tenant_id: "tenant-1", paperclip_company_id: "pc-company-1" }] }
    ];
    const queries: string[] = [];
    const values: unknown[][] = [];
    const client = {
      query: async (sql: string, params: unknown[] = []) => {
        queries.push(String(sql));
        values.push(params);
        return responses.shift() ?? { rows: [] };
      }
    };

    const preflight = await loadRuntimePreflight({
      client,
      tenantId: "tenant-1",
      workflowId: "wf_connect_first_workflow"
    });

    expect(preflight.workflow).toMatchObject({
      exists: true,
      enabled: true,
      packageId: "package-1",
      providerKind: "openai_api"
    });
    expect(queries[5]).toContain("order by created_at desc");
    expect(queries[5]).toContain("limit 1");
    expect(values[5]).toEqual(["tenant-1"]);
  });
});
