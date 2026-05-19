import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/0006_single_active_provider_lane.sql", "utf8");

describe("single active provider lane migration", () => {
  it("enforces one active secret reference per tenant and provider kind", () => {
    expect(migration).toMatch(/with ranked_active as \(/i);
    expect(migration).toMatch(/row_number\(\)\s+over\s+\([\s\S]*partition by tenant_id, provider_kind[\s\S]*order by updated_at desc nulls last, created_at desc nulls last, id desc[\s\S]*\)/i);
    expect(migration).toMatch(/update wfpc\.secret_references secrets/i);
    expect(migration).toMatch(/set revoked_at = now\(\),[\s\S]*updated_at = now\(\)/i);
    expect(migration).toMatch(/drop index if exists wfpc\.secret_references_active_unique/i);
    expect(migration).toMatch(/drop index if exists secret_references_active_unique/i);
    expect(migration).toMatch(/create unique index if not exists secret_references_active_provider_lane_unique/i);
    expect(migration).toMatch(/on wfpc\.secret_references \(tenant_id, provider_kind\)/i);
    expect(migration).toMatch(/where revoked_at is null/i);
  });
});
