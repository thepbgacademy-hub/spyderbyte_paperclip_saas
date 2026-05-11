import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/0003_package_purchase_guards.sql", "utf8");
const helper = readFileSync("scripts/apply-wfpc-migration.mjs", "utf8");

describe("package purchase guard migration", () => {
  it("adds an authoritative tenant package purchase table", () => {
    expect(migration).toMatch(/create table if not exists wfpc\.tenant_package_purchases/i);
    expect(migration).toMatch(/tenant_id uuid not null references wfpc\.tenants\(id\)/i);
    expect(migration).toMatch(/package_id uuid not null references wfpc\.wealth_factory_packages\(id\)/i);
    expect(migration).toMatch(/add constraint tenant_package_purchases_tenant_id_package_id_key[\s\S]+unique \(tenant_id, package_id\)/i);
    expect(migration).toMatch(/status text not null default 'active'/i);
  });

  it("keeps purchases tenant-scoped with RLS and readiness checks", () => {
    expect(migration).toMatch(/alter table wfpc\.tenant_package_purchases enable row level security/i);
    expect(migration).toMatch(/members can read tenant package purchases/i);
    expect(migration).toMatch(/tenant_package_purchases_active_idx/i);
    expect(helper).toMatch(/tenant_package_purchases/i);
    expect(helper).toMatch(/tenant_package_purchases_active_idx/i);
  });
});
