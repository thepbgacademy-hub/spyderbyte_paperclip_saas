import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/0029_wf_harness_card_execution_claims.sql", "utf8");
const helper = readFileSync("scripts/apply-wfpc-migration.mjs", "utf8");

describe("harness card execution-claim migration", () => {
  it("adds bounded execution-claim columns and consistency rules to harness cards", () => {
    expect(migration).toMatch(/alter table wfpc\.harness_cards/i);
    expect(migration).toMatch(/add column if not exists execution_claim_token text null/i);
    expect(migration).toMatch(/add column if not exists execution_claimed_at timestamptz null/i);
    expect(migration).toMatch(/harness_cards_execution_claim_consistency/i);
    expect(migration).toMatch(/state = 'working' and execution_claim_token is not null/i);
    expect(migration).toMatch(/create index if not exists harness_cards_run_state_execution_claim_idx/i);
  });

  it("keeps the migration helper aware of the execution-claim schema shape", () => {
    expect(helper).toMatch(/0029_wf_harness_card_execution_claims\.sql/i);
    expect(helper).toMatch(/harness_cards_execution_claim_consistency/i);
    expect(helper).toMatch(/harness_cards_run_state_execution_claim_idx/i);
  });
});
