import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/0039_factory_run_approvals.sql", "utf8");

describe("factory run approvals migration", () => {
  it("creates a tenant-owned approval table anchored to installs and deliverables", () => {
    expect(migration).toMatch(/create table if not exists wfpc\.factory_run_approvals/i);
    expect(migration).toMatch(/approval_id text primary key/i);
    expect(migration).toMatch(/tenant_id uuid not null references wfpc\.tenants\(id\) on delete cascade/i);
    expect(migration).toMatch(/foreign key \(package_install_id\) references wfpc\.factory_blueprint_package_installs\(install_id\)/i);
    expect(migration).toMatch(/foreign key \(deliverable_id\) references wfpc\.factory_run_deliverables\(deliverable_id\)/i);
    expect(migration).toMatch(/contract_key text not null check \(contract_key in \('original', 'revision_1'\)\)/i);
    expect(migration).toMatch(/approval_status text not null check \(approval_status in \('pending', 'approved', 'changes_requested'\)\)/i);
  });

  it("enforces at most one pending approval per tenant+run and a coherent resolution lifecycle", () => {
    expect(migration).toMatch(
      /create unique index if not exists factory_run_approvals_one_pending_per_run\s+on wfpc\.factory_run_approvals \(tenant_id, run_id\)/i,
    );
    expect(migration).toMatch(/where approval_status = 'pending'/i);
    expect(migration).toMatch(/constraint factory_run_approvals_lifecycle_check check/i);
  });

  it("enables tenant-scoped read policy while leaving write enforcement to the API phase", () => {
    expect(migration).toMatch(/alter table wfpc\.factory_run_approvals enable row level security/i);
    expect(migration).toMatch(/create policy "members can read factory run approvals"/i);
    expect(migration).toMatch(/using \(wfpc_private\.is_tenant_member\(tenant_id\)\)/i);
    expect(migration).not.toMatch(/for insert/i);
    expect(migration).not.toMatch(/for update/i);
    expect(migration).not.toMatch(/for delete/i);
  });
});
