import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/0007_secret_revocation_reasons.sql", "utf8");

describe("secret revocation reason migration", () => {
  it("adds a revocation reason column and defaults manual revokes for existing rows", () => {
    expect(migration).toMatch(/alter table wfpc\.secret_references[\s\S]+add column if not exists revoked_reason text/i);
    expect(migration).toMatch(/set revoked_reason = 'manual'[\s\S]+where revoked_at is not null[\s\S]+revoked_reason is null/i);
    expect(migration).toMatch(/check \(\s*revoked_reason is null\s+or\s+revoked_reason in \('manual', 'superseded'\)\s*\)/i);
  });
});
