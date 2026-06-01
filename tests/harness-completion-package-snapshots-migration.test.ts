import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/0027_wf_harness_completion_package_snapshots.sql", "utf8");
const helper = readFileSync("scripts/apply-wfpc-migration.mjs", "utf8");

describe("harness completion package snapshots migration", () => {
  it("creates a bounded completion-package snapshot ledger with tenant-scoped reads", () => {
    expect(migration).toMatch(/create table if not exists wfpc\.harness_completion_package_snapshots/i);
    expect(migration).toMatch(/run_id uuid primary key/i);
    expect(migration).toMatch(/snapshot_payload jsonb not null/i);
    expect(migration).toMatch(/jsonb_typeof\(snapshot_payload\) = 'object'/i);
    expect(migration).toMatch(/run_id uuid primary key/i);
    expect(migration).toMatch(/references wfpc\.harness_runs\(id\) on delete cascade/i);
    expect(migration).toMatch(/enable row level security/i);
    expect(migration).toMatch(/members can read harness completion package snapshots/i);
  });

  it("is included in the migration helper readiness path", () => {
    expect(helper).toMatch(/0027_wf_harness_completion_package_snapshots\.sql/i);
    expect(helper).toMatch(/has_completion_package_snapshots/i);
    expect(helper).toMatch(/has_completion_package_snapshot_payload/i);
    expect(helper).toMatch(/has_completion_package_snapshot_check/i);
    expect(helper).toMatch(/has_completion_package_snapshot_rls/i);
    expect(helper).toMatch(/has_completion_package_snapshot_policy/i);
    expect(helper).toMatch(/Harness completion package snapshot migration did not produce the required schema shape/i);
  });
});
