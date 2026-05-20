import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/0013_paperclip_company_issue_agents.sql", "utf8");
const helper = readFileSync("scripts/apply-wfpc-migration.mjs", "utf8");

describe("paperclip company issue agent mapping migration", () => {
  it("adds a per-company Paperclip issue agent mapping column", () => {
    expect(migration).toMatch(/alter table wfpc\.paperclip_company_mappings/i);
    expect(migration).toMatch(/add column if not exists paperclip_issue_agent_id text/i);
  });

  it("is included in the live migration helper", () => {
    expect(helper).toMatch(/0013_paperclip_company_issue_agents\.sql/i);
    expect(helper).toMatch(/paperclip_issue_agent_id/i);
  });
});

