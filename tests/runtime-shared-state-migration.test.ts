import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/0010_runtime_shared_state.sql", "utf8");
const helper = readFileSync("scripts/apply-wfpc-migration.mjs", "utf8");

describe("runtime shared state migration", () => {
  it("creates persistent oauth state and rate-limit buckets", () => {
    expect(migration).toMatch(/create table if not exists wfpc_private\.oauth_pending_states/i);
    expect(migration).toMatch(/state text primary key/i);
    expect(migration).toMatch(/public_target jsonb not null/i);
    expect(migration).toMatch(/create index if not exists oauth_pending_states_expires_at_idx/i);
    expect(migration).toMatch(/create table if not exists wfpc_private\.rate_limit_buckets/i);
    expect(migration).toMatch(/bucket_key text primary key/i);
  });

  it("is included in the live migration helper", () => {
    expect(helper).toMatch(/0010_runtime_shared_state\.sql/i);
    expect(helper).toMatch(/oauth_pending_states/i);
    expect(helper).toMatch(/rate_limit_buckets/i);
  });
});
