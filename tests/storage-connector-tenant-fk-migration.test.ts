import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/0008_storage_connector_tenant_fk.sql", "utf8");
const helper = readFileSync("scripts/apply-wfpc-migration.mjs", "utf8");

describe("storage connector tenant consistency migration", () => {
  it("enforces private storage secret rows belong to the same tenant as their public connector", () => {
    expect(migration).toMatch(/storage_connectors_id_tenant_id_key/i);
    expect(migration).toMatch(/unique \(id, tenant_id\)/i);
    expect(migration).toMatch(/storage_connector_secrets_connector_tenant_fkey/i);
    expect(migration).toMatch(/foreign key \(storage_connector_id, tenant_id\)/i);
    expect(migration).toMatch(/references wfpc\.storage_connectors \(id, tenant_id\)/i);
  });

  it("keeps the live migration helper aware of the tenant consistency migration", () => {
    expect(helper).toMatch(/0008_storage_connector_tenant_fk\.sql/i);
    expect(helper).toMatch(/storage_connector_secrets_connector_tenant_fkey/i);
  });
});
