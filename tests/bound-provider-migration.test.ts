import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/0005_bound_provider_context.sql", "utf8");
const helper = readFileSync("scripts/apply-wfpc-migration.mjs", "utf8");

describe("bound provider context migration", () => {
  it("stores retry-safe provider bindings on workflow runs", () => {
    expect(migration).toMatch(/alter table wfpc\.workflow_runs[\s\S]+bound_secret_reference_id uuid/i);
    expect(migration).toMatch(/references wfpc\.secret_references\(id\) on delete restrict/i);
    expect(migration).toMatch(/alter table wfpc\.workflow_runs[\s\S]+bound_provider_context jsonb/i);
    expect(migration).toMatch(/jsonb_typeof\(bound_provider_context\) = 'array'/i);
    expect(migration).toMatch(/workflow_runs_bound_secret_reference_idx/i);
  });

  it("is included in the live migration helper with shape checks", () => {
    expect(helper).toMatch(/0005_bound_provider_context\.sql/i);
    expect(helper).toMatch(/workflow_runs_bound_secret_reference_id_fkey/i);
    expect(helper).toMatch(/references wfpc\.secret_references\(id\)/i);
    expect(helper).toMatch(/workflow_runs_bound_provider_context_object_check/i);
    expect(helper).toMatch(/jsonb_typeof\(bound_provider_context\) = ''array''/i);
  });
});
