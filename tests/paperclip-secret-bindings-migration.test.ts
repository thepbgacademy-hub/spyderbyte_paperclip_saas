import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/0011_paperclip_secret_bindings.sql", "utf8");
const helper = readFileSync("scripts/apply-wfpc-migration.mjs", "utf8");

describe("paperclip secret bindings migration", () => {
  it("creates the binding table for synced paperclip secret refs", () => {
    expect(migration).toMatch(/create table if not exists wfpc\.paperclip_secret_bindings/i);
    expect(migration).toMatch(/wealth_factory_secret_reference_id uuid not null references wfpc\.secret_references\(id\)/i);
    expect(migration).toMatch(/paperclip_secret_id text not null/i);
    expect(migration).toMatch(/binding_status text not null check \(binding_status in \('active', 'revoked', 'error'\)\)/i);
    expect(migration).toMatch(/enable row level security/i);
  });

  it("is included in the live migration helper", () => {
    expect(helper).toMatch(/0011_paperclip_secret_bindings\.sql/i);
    expect(helper).toMatch(/paperclip_secret_bindings/i);
  });
});
