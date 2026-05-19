import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/0002_acid_race_guards.sql", "utf8");

describe("ACID race guard migration", () => {
  it("adds workflow run reservations with tenant workflow idempotency uniqueness", () => {
    expect(migration).toMatch(/create table if not exists wfpc\.workflow_run_reservations/i);
    expect(migration).toMatch(/workflow_run_reservations_idempotency_unique/i);
    expect(migration).toMatch(/on wfpc\.workflow_run_reservations \(tenant_id, workflow_template_id, idempotency_key\)/i);
    expect(migration).toMatch(/add column if not exists run_id uuid/i);
    expect(migration).toMatch(/set run_id = gen_random_uuid\(\)[\s\S]+where run_id is null/i);
    expect(migration).toMatch(/alter column run_id set not null/i);
    expect(migration).toMatch(/workflow_run_reservations_run_id_unique/i);
  });

  it("adds package ownership to workflow templates for package-boundary checks", () => {
    expect(migration).toMatch(/alter table wfpc\.workflow_templates[\s\S]+add column if not exists package_id uuid/i);
    expect(migration).toMatch(/workflow_templates_package_fk/i);
    expect(migration).toMatch(/workflow_templates_package_idx/i);
  });

  it("keeps reservation and secret race structures private by default", () => {
    expect(migration).toMatch(/alter table wfpc\.workflow_run_reservations enable row level security/i);
    expect(migration).not.toMatch(/create policy[\s\S]+workflow_run_reservations/i);
    expect(migration).toMatch(/create unique index if not exists secret_references_active_unique/i);
    expect(migration).toMatch(/where revoked_at is null/i);
  });

  it("adds lookup support for credential and status race guards", () => {
    expect(migration).toMatch(/secret_references_tenant_secret_ref_unique/i);
    expect(migration).toMatch(/workflow_runs_status_guard_idx/i);
    expect(migration).toMatch(/workflow_run_reservations_idempotency_unique/i);
  });
});
