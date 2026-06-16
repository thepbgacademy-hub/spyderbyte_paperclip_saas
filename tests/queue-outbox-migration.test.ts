import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/0004_workflow_queue_outbox.sql", "utf8");
const helper = readFileSync("scripts/apply-wfpc-migration.mjs", "utf8");

describe("workflow queue outbox migration", () => {
  it("adds a durable tenant-scoped outbox for workflow enqueue recovery", () => {
    expect(migration).toMatch(/create table if not exists wfpc\.workflow_queue_outbox/i);
    expect(migration).toMatch(/run_id uuid not null references wfpc\.workflow_runs\(id\)/i);
    expect(migration).toMatch(/created_by_user_id uuid not null references auth\.users\(id\)/i);
    expect(migration).toMatch(/claim_token uuid/i);
    expect(migration).toMatch(/alter column attempts set not null/i);
    expect(migration).toMatch(/alter column available_at set not null/i);
    expect(migration).toMatch(/alter column status set not null/i);
    expect(migration).toMatch(/alter column idempotency_key set not null/i);
    expect(migration).toMatch(/primary key \(id\)/i);
    expect(migration).toMatch(/references wfpc\.workflow_runs\(id\)/i);
    expect(migration).toMatch(/status text not null default 'pending'/i);
    expect(migration).toMatch(/set created_by_user_id = runs\.created_by_user_id/i);
    expect(migration).toMatch(/insert into wfpc\.workflow_queue_outbox[\s\S]+from wfpc\.workflow_runs runs[\s\S]+join wfpc\.workflow_run_reservations reservations/i);
    expect(migration).toMatch(/reservations\.created_at/i);
    expect(migration).not.toMatch(/reservations\.reserved_at/i);
    expect(migration).toMatch(/public_workflow_id/i);
    expect(migration).toMatch(/workflow_identity_kind/i);
    expect(migration).toMatch(/unique \(tenant_id, run_id\)/i);
    expect(migration).toMatch(/unique \(tenant_id, workflow_template_id, idempotency_key\)/i);
  });

  it("keeps the outbox private and verifies readiness in the live helper", () => {
    expect(migration).toMatch(/workflow_queue_outbox_pending_idx/i);
    expect(migration).toMatch(/workflow_queue_outbox_claimed_idx/i);
    expect(migration).toMatch(/alter table wfpc\.workflow_queue_outbox enable row level security/i);
    expect(migration).not.toMatch(/create policy[\s\S]+workflow_queue_outbox/i);
    expect(helper).toMatch(/workflow_queue_outbox/i);
    expect(helper).toMatch(/workflow_queue_outbox_pending_idx/i);
    expect(helper).toMatch(/workflow_queue_outbox_claimed_idx/i);
    expect(helper).toMatch(/workflow_queue_outbox_status_check/i);
    expect(helper).toMatch(/has_status_check/i);
    expect(helper).toMatch(/has_primary_key/i);
    expect(helper).toMatch(/has_run_fk/i);
    expect(helper).toMatch(/has_workflow_template_fk/i);
  });
});
