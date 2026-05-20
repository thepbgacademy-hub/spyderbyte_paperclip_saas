import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/0012_paperclip_secret_binding_versions.sql", "utf8");
const helper = readFileSync("scripts/apply-wfpc-migration.mjs", "utf8");

describe("paperclip secret binding versions migration", () => {
  it("adds a persisted Paperclip secret version column and lookup index", () => {
    expect(migration).toMatch(/alter table wfpc\.paperclip_secret_bindings/i);
    expect(migration).toMatch(/add column if not exists paperclip_secret_version text/i);
  });

  it("is included in the live migration helper", () => {
    expect(helper).toMatch(/0012_paperclip_secret_binding_versions\.sql/i);
    expect(helper).toMatch(/paperclip_secret_version/i);
  });
});
