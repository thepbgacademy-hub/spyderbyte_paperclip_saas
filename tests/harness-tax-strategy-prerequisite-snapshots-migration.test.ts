import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/0033_wf_harness_tax_strategy_prerequisite_snapshots.sql",
  "utf8"
);
const helper = readFileSync("scripts/apply-wfpc-migration.mjs", "utf8");

describe("harness tax-strategy prerequisite snapshots migration", () => {
  it("creates a bounded tax-prerequisite snapshot ledger with tenant-scoped reads", () => {
    expect(migration).toMatch(/create table if not exists wfpc\.harness_tax_strategy_prerequisite_snapshots/i);
    expect(migration).toMatch(/run_id uuid primary key/i);
    expect(migration).toMatch(/snapshot_payload jsonb not null/i);
    expect(migration).toMatch(/jsonb_typeof\(snapshot_payload\) = 'object'/i);
    expect(migration).toMatch(/references wfpc\.harness_runs\(id\) on delete cascade/i);
    expect(migration).toMatch(/enable row level security/i);
    expect(migration).toMatch(/members can read harness tax strategy prerequisite snapshots/i);
  });

  it("is included in the migration helper readiness path", () => {
    expect(helper).toMatch(/0033_wf_harness_tax_strategy_prerequisite_snapshots\.sql/i);
    expect(helper).toMatch(/has_tax_strategy_prerequisite_snapshots/i);
    expect(helper).toMatch(/has_tax_strategy_prerequisite_snapshot_payload/i);
    expect(helper).toMatch(/has_tax_strategy_prerequisite_snapshot_check/i);
    expect(helper).toMatch(/has_tax_strategy_prerequisite_snapshot_rls/i);
    expect(helper).toMatch(/has_tax_strategy_prerequisite_snapshot_policy/i);
    expect(helper).toMatch(/Harness tax strategy prerequisite snapshot migration did not produce the required schema shape/i);
  });
});
