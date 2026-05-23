import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/0018_wf_harness_lane_handoff.sql", "utf8");
const helper = readFileSync("scripts/apply-wfpc-migration.mjs", "utf8");

describe("harness lane handoff migration", () => {
  it("widens harness proposal and decision resolution checks for lane handoff", () => {
    expect(migration).toMatch(/harness_subcard_proposals_resolution_check/i);
    expect(migration).toMatch(/harness_board_decisions_resolution_check/i);
    expect(migration).toMatch(/handoff_existing_lane/i);
  });

  it("is included in the live migration helper readiness path", () => {
    expect(helper).toMatch(/0018_wf_harness_lane_handoff\.sql/i);
    expect(helper).toMatch(/has_proposal_handoff_resolution/i);
    expect(helper).toMatch(/has_decision_handoff_resolution/i);
  });
});
