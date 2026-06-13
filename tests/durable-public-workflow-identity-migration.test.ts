import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/0032_durable_public_workflow_identity.sql", "utf8");
const helper = readFileSync("scripts/apply-wfpc-migration.mjs", "utf8");

describe("durable public workflow identity migration", () => {
  it("adds public workflow identity columns while relaxing template-only assumptions", () => {
    expect(migration).toMatch(/workflow_run_reservations[\s\S]+public_workflow_id text/i);
    expect(migration).toMatch(/workflow_runs[\s\S]+public_workflow_id text/i);
    expect(migration).toMatch(/workflow_queue_outbox[\s\S]+public_workflow_id text/i);
    expect(migration).toMatch(/alter table wfpc\.workflow_runs[\s\S]+alter column workflow_template_id drop not null/i);
    expect(migration).toMatch(/workflow_identity_kind in \('tenant_template', 'installed_package_overlay'\)/i);
    expect(migration).toMatch(/workflow_run_reservations_public_idempotency_unique/i);
    expect(migration).toMatch(/workflow_queue_outbox_tenant_id_public_workflow_id_idempo_key/i);
  });

  it("wires the helper to enforce the durable public identity schema", () => {
    expect(helper).toMatch(/0032_durable_public_workflow_identity\.sql/i);
    expect(helper).toMatch(/workflow_run_reservations_public_idempotency_unique/i);
    expect(helper).toMatch(/workflow_queue_outbox_tenant_id_public_workflow_id_idempo_key/i);
    expect(helper).toMatch(/Durable public workflow identity migration did not produce the required schema shape/i);
  });
});
