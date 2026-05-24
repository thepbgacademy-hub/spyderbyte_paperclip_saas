import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/0019_wf_harness_card_continuity.sql", "utf8");
const continuitySourceMigration = readFileSync("supabase/migrations/0020_wf_harness_card_continuity_source.sql", "utf8");
const helper = readFileSync("scripts/apply-wfpc-migration.mjs", "utf8");

describe("harness card continuity migration", () => {
  it("adds a bounded continuity snapshot table for live lane memory", () => {
    expect(migration).toMatch(/create table if not exists wfpc\.harness_card_continuity/i);
    expect(migration).toMatch(/card_id uuid primary key references wfpc\.harness_cards\(id\) on delete cascade/i);
    expect(migration).toMatch(/run_id uuid not null references wfpc\.harness_runs\(id\) on delete cascade/i);
    expect(migration).toMatch(/continuity_summary text null/i);
    expect(migration).toMatch(/latest_result_summary text null/i);
    expect(migration).toMatch(/absorbed_work_items jsonb not null default '\[\]'::jsonb/i);
    expect(migration).toMatch(/jsonb_typeof\(absorbed_work_items\) = 'array'/i);
  });

  it("is included in the live migration helper readiness path", () => {
    expect(helper).toMatch(/0019_wf_harness_card_continuity\.sql/i);
    expect(helper).toMatch(/0020_wf_harness_card_continuity_source\.sql/i);
    expect(helper).toMatch(/has_continuity_source/i);
    expect(helper).toMatch(/has_continuity_source_check/i);
    expect(helper).toMatch(/harness_card_continuity/i);
    expect(helper).toMatch(/has_continuity_summary/i);
    expect(helper).toMatch(/has_latest_result_summary/i);
    expect(helper).toMatch(/has_absorbed_work_items/i);
    expect(helper).toMatch(/has_run_updated_index/i);
    expect(helper).toMatch(/Harness card continuity migration did not produce the required schema shape/i);
  });

  it("adds a bounded continuity source discriminator without widening into a second memory store", () => {
    expect(continuitySourceMigration).toMatch(/alter table if exists wfpc\.harness_card_continuity/i);
    expect(continuitySourceMigration).toMatch(/add column if not exists continuity_source text not null default 'state_transition'/i);
    expect(continuitySourceMigration).toMatch(/harness_card_continuity_source_check/i);
    expect(continuitySourceMigration).toMatch(/'state_transition'/i);
    expect(continuitySourceMigration).toMatch(/'resume_override'/i);
    expect(continuitySourceMigration).toMatch(/'proposal_absorbed'/i);
    expect(continuitySourceMigration).toMatch(/'lane_handoff'/i);
    expect(continuitySourceMigration).toMatch(/'result_recorded'/i);
  });
});
