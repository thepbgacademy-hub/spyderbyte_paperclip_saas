import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/0005_private_encrypted_vault.sql", "utf8");
const helper = readFileSync("scripts/apply-wfpc-migration.mjs", "utf8");

describe("private encrypted vault migration", () => {
  it("stores encrypted vault material in the private schema only", () => {
    expect(migration).toMatch(/create table if not exists wfpc_private\.vault_secrets/i);
    expect(migration).toMatch(/ciphertext text not null/i);
    expect(migration).toMatch(/iv text not null/i);
    expect(migration).toMatch(/tag text not null/i);
    expect(migration).toMatch(/revoke all on wfpc_private\.vault_secrets from authenticated/i);
    expect(migration).toMatch(/alter table wfpc_private\.vault_secrets enable row level security/i);
    expect(migration).not.toMatch(/api[_-]?key|raw_secret|secret_value/i);
  });

  it("is included in the live Supabase migration helper", () => {
    expect(helper).toMatch(/0005_private_encrypted_vault\.sql/i);
    expect(helper).toMatch(/wfpc_private' and table_name = 'vault_secrets'/i);
  });
});
