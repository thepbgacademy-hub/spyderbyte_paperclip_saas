import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/0006_vault_storage_secret_kinds.sql", "utf8");
const helper = readFileSync("scripts/apply-wfpc-migration.mjs", "utf8");

describe("vault storage secret kind migration", () => {
  it("allows storage provider secret kinds in the private vault", () => {
    expect(migration).toMatch(/alter table wfpc_private\.vault_secrets/i);
    expect(migration).toMatch(/alter column provider_kind type text/i);
    expect(migration).toMatch(/using provider_kind::text/i);
  });

  it("is included in the live migration helper", () => {
    expect(helper).toMatch(/0006_vault_storage_secret_kinds\.sql/i);
    expect(helper).toMatch(/data_type = 'text'/i);
  });
});
