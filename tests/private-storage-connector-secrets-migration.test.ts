import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/0007_private_storage_connector_secrets.sql", "utf8");
const helper = readFileSync("scripts/apply-wfpc-migration.mjs", "utf8");

describe("private storage connector secrets migration", () => {
  it("stores connector secret references in the private schema only", () => {
    expect(migration).toMatch(/create table if not exists wfpc_private\.storage_connector_secrets/i);
    expect(migration).toMatch(/secret_refs jsonb not null/i);
    expect(migration).toMatch(/revoke all on wfpc_private\.storage_connector_secrets from authenticated/i);
    expect(migration).toMatch(/alter table wfpc_private\.storage_connector_secrets enable row level security/i);
  });

  it("is included in the live migration helper", () => {
    expect(helper).toMatch(/0007_private_storage_connector_secrets\.sql/i);
    expect(helper).toMatch(/storage_connector_secrets/i);
  });
});
