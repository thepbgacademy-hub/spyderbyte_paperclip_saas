import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/0035_wf_harness_fresh_cycle_runs.sql", "utf8");
const helper = readFileSync("scripts/apply-wfpc-migration.mjs", "utf8");

describe("harness fresh-cycle runs migration", () => {
  it("replaces tenant workflow uniqueness with a latest-run lookup index", () => {
    expect(migration).toMatch(/drop index if exists wfpc\.harness_runs_tenant_workflow_unique_idx/i);
    expect(migration).toMatch(/create index if not exists harness_runs_tenant_workflow_latest_idx/i);
    expect(migration).toMatch(/tenant_id, workflow_id, updated_at desc, created_at desc/i);
    expect(migration).toMatch(/create unique index if not exists harness_runs_previous_run_successor_unique_idx/i);
    expect(migration).toMatch(/runtime_context ->> 'previousRunId'/i);
    expect(migration).toMatch(/where runtime_context \? 'previousRunId'/i);
  });

  it("is applied and verified by the wfpc migration helper", () => {
    expect(helper).toMatch(/0035_wf_harness_fresh_cycle_runs\.sql/i);
    expect(helper).toMatch(/harness_runs_tenant_workflow_unique_idx/i);
    expect(helper).toMatch(/harness_runs_tenant_workflow_latest_idx/i);
    expect(helper).toMatch(/harness_runs_previous_run_successor_unique_idx/i);
    expect(helper).toMatch(/Harness fresh-cycle runs migration did not produce the required schema shape/i);
  });
});
