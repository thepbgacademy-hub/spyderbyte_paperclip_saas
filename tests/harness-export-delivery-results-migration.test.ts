import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/0023_wf_harness_export_delivery_results.sql", "utf8");
const helper = readFileSync("scripts/apply-wfpc-migration.mjs", "utf8");

describe("harness export delivery results migration", () => {
  it("widens the delivery ledger for delivery outcomes and writer receipts", () => {
    expect(migration).toMatch(/add column if not exists attempt_count integer not null default 0/i);
    expect(migration).toMatch(/add column if not exists last_attempted_at timestamptz null/i);
    expect(migration).toMatch(/add column if not exists delivered_at timestamptz null/i);
    expect(migration).toMatch(/add column if not exists writer_kind text null/i);
    expect(migration).toMatch(/add column if not exists delivery_receipt jsonb not null default '\{\}'::jsonb/i);
    expect(migration).toMatch(/add column if not exists last_error_code text null/i);
    expect(migration).toMatch(/add column if not exists last_error_message text null/i);
    expect(migration).toMatch(/delivery_failed/i);
    expect(migration).toMatch(/obsidian_filesystem/i);
    expect(migration).toMatch(/jsonb_typeof\(delivery_receipt\) = 'object'/i);
  });

  it("is included in the live migration helper readiness path", () => {
    expect(helper).toMatch(/0023_wf_harness_export_delivery_results\.sql/i);
    expect(helper).toMatch(/has_attempt_count/i);
    expect(helper).toMatch(/has_delivery_receipt/i);
    expect(helper).toMatch(/has_writer_kind/i);
    expect(helper).toMatch(/has_delivery_receipt_check/i);
    expect(helper).toMatch(/Harness export delivery results migration did not produce the required schema shape/i);
  });
});
