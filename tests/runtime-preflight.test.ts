import { describe, expect, it } from "vitest";

import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { loadRuntimePreflight, summarizeRuntimePreflight } = require("../scripts/lib/runtime-preflight.mjs");

describe("runtime preflight", () => {
  it("flags missing bound-provider and purchase schema as blockers", async () => {
    const responses = [
      { rows: [{ column_name: "id" }, { column_name: "status" }] },
      { rows: [{ column_name: "id" }, { column_name: "status" }] },
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
    expect(summary.blockers).toContain("tenant_package_purchases is missing the purchaser column expected by the live-drive seed path");
    expect(preflight.schema.purchaseActorColumn).toBe(null);
  });

  it("returns a blocker instead of throwing when the mapping table is absent", async () => {
    const responses = [
      { rows: [{ column_name: "id" }, { column_name: "bound_secret_reference_id" }, { column_name: "bound_provider_context" }] },
      { rows: [{ column_name: "id" }, { column_name: "purchased_by_user_id" }] },
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
});
