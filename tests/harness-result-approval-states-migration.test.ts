import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/0034_wf_harness_result_approval_states.sql", "utf8");
const helper = readFileSync("scripts/apply-wfpc-migration.mjs", "utf8");

describe("harness result approval states migration", () => {
  it("creates a run-scoped approval state table for dashboard results", () => {
    expect(migration).toMatch(/create table if not exists wfpc\.harness_result_approval_states/i);
    expect(migration).toMatch(/primary key \(tenant_id, run_id, result_id\)/i);
    expect(migration).toMatch(/approval_state text not null check/i);
    expect(migration).toMatch(/'Awaiting review', 'Approved', 'Revision needed'/i);
    expect(migration).toMatch(/foreign key \(run_id, tenant_id\) references wfpc\.harness_runs\(id, tenant_id\)/i);
    expect(migration).toMatch(/enable row level security/i);
    expect(migration).toMatch(/members can read harness result approval states/i);
  });

  it("is included in the live migration helper readiness path", () => {
    expect(helper).toMatch(/0034_wf_harness_result_approval_states\.sql/i);
    expect(helper).toMatch(/has_harness_result_approval_states/i);
    expect(helper).toMatch(/has_result_approval_primary_key/i);
    expect(helper).toMatch(/has_result_approval_run_tenant_fk/i);
    expect(helper).toMatch(/has_result_approval_rls/i);
    expect(helper).toMatch(/Harness result approval states migration did not produce the required schema shape/i);
  });
});
