import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/0015_wf_harness_proposal_resolutions.sql", "utf8");
const helper = readFileSync("scripts/apply-wfpc-migration.mjs", "utf8");

describe("harness proposal resolution migration", () => {
  it("widens proposal status support and stores optional resolution metadata", () => {
    expect(migration).toMatch(/drop constraint if exists harness_subcard_proposals_status_check/i);
    expect(migration).toMatch(/add column if not exists resolution text null/i);
    expect(migration).toMatch(/add column if not exists decision_note text null/i);
    expect(migration).toMatch(/status in \('proposed', 'approved', 'deferred', 'denied'\)/i);
    expect(migration).toMatch(/resolution is null or resolution in \('create_lane', 'update_existing_lane'\)/i);
  });

  it("drops the one-proposal-per-approved-card unique index so existing lanes can absorb bounded updates", () => {
    expect(migration).toMatch(/drop index if exists wfpc\.harness_subcard_proposals_approved_card_idx/i);
    expect(migration).toMatch(/drop index if exists harness_subcard_proposals_approved_card_idx/i);
    expect(migration).toMatch(/create index if not exists harness_subcard_proposals_run_status_idx/i);
  });

  it("is included in the live migration helper", () => {
    expect(helper).toMatch(/0013_wf_harness_runs_cards\.sql/i);
    expect(helper).toMatch(/0014_wf_harness_subcard_proposals\.sql/i);
    expect(helper).toMatch(/0015_wf_harness_proposal_resolutions\.sql/i);
    expect(helper).toMatch(/harness_subcard_proposals_resolution_check/i);
    expect(helper).toMatch(/harness_subcard_proposals_approved_card_idx/i);
  });
});
