import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { createTenantService, TenantAccessError } from "../src/tenants/tenant-service.js";

const migration = readFileSync("supabase/migrations/0001_initial_tenant_model.sql", "utf8");

describe("tenant model migration", () => {
  const tenantTables = [
    "tenants",
    "tenant_memberships",
    "paperclip_company_mappings",
    "workflow_templates",
    "workflow_runs",
    "secret_references",
    "audit_events",
    "operator_actions"
  ];

  it("creates every required tenant-owned table", () => {
    for (const table of tenantTables) {
      expect(migration).toMatch(new RegExp(`create table public\\.${table}\\b`, "i"));
    }
  });

  it("enables RLS on every tenant-owned table", () => {
    for (const table of tenantTables) {
      expect(migration).toMatch(new RegExp(`alter table public\\.${table}\\s+enable row level security`, "i"));
    }
  });

  it("uses auth.uid membership policies instead of user-editable metadata", () => {
    expect(migration).toContain("auth.uid()");
    expect(migration).toContain("private.is_tenant_member");
    expect(migration).not.toMatch(/user_metadata|raw_user_meta_data/i);
  });

  it("does not expose Paperclip company mappings or secret references without membership checks", () => {
    expect(policyFor("paperclip_company_mappings")).toContain("private.is_tenant_member(tenant_id)");
    expect(migration).not.toMatch(/create policy "members can read secret reference metadata"[\s\S]+on public\.secret_references/i);
    expect(migration).not.toMatch(/grant select[\s\S]+on public\.secret_references to authenticated/i);
  });

  it("keeps RLS helper functions private and security definer to avoid recursive membership policies", () => {
    expect(migration).toMatch(/create schema if not exists private/i);
    expect(migration).toMatch(/create function private\.is_tenant_member[\s\S]+security definer/i);
    expect(migration).toMatch(/create function private\.is_tenant_operator[\s\S]+security definer/i);
    expect(migration).not.toMatch(/create function public\.is_tenant_member/i);
  });

  it("grants authenticated users execute on private helpers used by RLS policies", () => {
    expect(migration).toMatch(/grant execute on function private\.is_tenant_member\(uuid\) to authenticated/i);
    expect(migration).toMatch(/grant execute on function private\.is_tenant_operator\(uuid\) to authenticated/i);
    expect(migration).toMatch(
      /grant execute on function private\.workflow_template_belongs_to_tenant\(uuid, uuid\) to authenticated/i
    );
  });

  it("prevents workflow runs from linking templates across tenants", () => {
    expect(migration).toMatch(/unique \(id, tenant_id\)/i);
    expect(migration).toMatch(
      /foreign key \(workflow_template_id, tenant_id\)\s+references public\.workflow_templates\(id, tenant_id\)/i
    );
    expect(migration).toMatch(
      /create policy "members can create workflow runs"[\s\S]+private\.workflow_template_belongs_to_tenant\(workflow_template_id, tenant_id\)/i
    );
  });
});

describe("tenant service", () => {
  it("authorizes run starts for tenant members only", async () => {
    const service = createTenantService({
      isTenantMember: async ({ tenantId, userId }) => tenantId === "tenant-1" && userId === "user-1",
      workflowBelongsToTenant: async ({ tenantId, workflowId }) => tenantId === "tenant-1" && workflowId === "workflow-1",
      runBelongsToTenant: async ({ tenantId, runId }) => tenantId === "tenant-1" && runId === "run-1"
    });

    await expect(
      service.authorizeRunStart({
        tenantId: "tenant-1",
        workflowId: "workflow-1",
        runId: "run-1",
        createdByUserId: "user-1"
      })
    ).resolves.toBe(true);

    await expect(
      service.authorizeRunStart({
        tenantId: "tenant-2",
        workflowId: "workflow-1",
        runId: "run-1",
        createdByUserId: "user-1"
      })
    ).resolves.toBe(false);
  });

  it("fails closed when tenant checks throw", async () => {
    const service = createTenantService({
      isTenantMember: async () => {
        throw new Error("database unavailable");
      },
      workflowBelongsToTenant: async () => true,
      runBelongsToTenant: async () => true
    });

    await expect(
      service.requireTenantMember({
        tenantId: "tenant-1",
        userId: "user-1"
      })
    ).rejects.toBeInstanceOf(TenantAccessError);
  });
});

function policyFor(table: string): string {
  const match = migration.match(new RegExp(`create policy[\\s\\S]+?on public\\.${table}[\\s\\S]+?;`, "i"));
  return match?.[0] ?? "";
}
