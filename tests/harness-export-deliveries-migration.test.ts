import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/0021_wf_harness_export_deliveries.sql", "utf8");
const rlsMigration = readFileSync("supabase/migrations/0022_wf_harness_export_deliveries_rls.sql", "utf8");
const packageBundleMigration = readFileSync("supabase/migrations/0024_wf_harness_export_delivery_package_bundle.sql", "utf8");
const claimMigration = readFileSync("supabase/migrations/0025_wf_harness_export_delivery_claims.sql", "utf8");
const helper = readFileSync("scripts/apply-wfpc-migration.mjs", "utf8");

describe("harness export deliveries migration", () => {
  it("adds a harness-owned export delivery ledger for tenant-safe bundle handoff", () => {
    expect(migration).toMatch(/create table if not exists wfpc\.harness_export_deliveries/i);
    expect(migration).toMatch(/run_id uuid not null references wfpc\.harness_runs\(id\) on delete cascade/i);
    expect(migration).toMatch(/candidate_id text not null check \(candidate_id in \('governance_history_export'\)\)/i);
    expect(migration).toMatch(/status text not null check \(status in \('export_ready'\)\)/i);
    expect(migration).toMatch(/placement_manifest jsonb not null/i);
    expect(migration).toMatch(/files jsonb not null default '\[\]'::jsonb/i);
    expect(migration).toMatch(/jsonb_typeof\(placement_manifest\) = 'object'/i);
    expect(migration).toMatch(/jsonb_typeof\(files\) = 'array'/i);
    expect(migration).toMatch(/create unique index if not exists harness_export_deliveries_idempotency_key_idx/i);
  });

  it("is included in the live migration helper readiness path", () => {
    expect(helper).toMatch(/0021_wf_harness_export_deliveries\.sql/i);
    expect(helper).toMatch(/0022_wf_harness_export_deliveries_rls\.sql/i);
    expect(helper).toMatch(/0024_wf_harness_export_delivery_package_bundle\.sql/i);
    expect(helper).toMatch(/0025_wf_harness_export_delivery_claims\.sql/i);
    expect(helper).toMatch(/has_placement_manifest/i);
    expect(helper).toMatch(/has_files/i);
    expect(helper).toMatch(/has_idempotency_key/i);
    expect(helper).toMatch(/has_placement_manifest_check/i);
    expect(helper).toMatch(/has_files_check/i);
    expect(helper).toMatch(/has_idempotency_index/i);
    expect(helper).toMatch(/Harness export deliveries migration did not produce the required schema shape/i);
    expect(helper).toMatch(/has_rls/i);
    expect(helper).toMatch(/has_member_read_policy/i);
    expect(helper).toMatch(/Harness export deliveries RLS migration did not produce the required policy shape/i);
    expect(helper).toMatch(/has_package_bundle_candidate/i);
    expect(helper).toMatch(/has_package_bundle_record_target/i);
    expect(helper).toMatch(/Harness export delivery package-bundle widening did not produce the required schema shape/i);
    expect(helper).toMatch(/has_delivery_in_progress_status/i);
    expect(helper).toMatch(/Harness export delivery claim migration did not produce the required schema shape/i);
  });

  it("keeps the delivery ledger tenant-scoped with RLS", () => {
    expect(rlsMigration).toMatch(/alter table wfpc\.harness_export_deliveries enable row level security/i);
    expect(rlsMigration).toMatch(/members can read harness export deliveries/i);
    expect(rlsMigration).toMatch(/wfpc_private\.is_tenant_member\(tenant_id\)/i);
  });

  it("widens the delivery ledger for package-bundle export candidates", () => {
    expect(packageBundleMigration).toMatch(/candidate_id in \('governance_history_export', 'package_bundle_export'\)/i);
    expect(packageBundleMigration).toMatch(/record_target in \('governance_history_record', 'package_deliverable_record'\)/i);
  });

  it("widens the delivery ledger for in-progress delivery claims", () => {
    expect(claimMigration).toMatch(/status in \('export_ready', 'delivery_in_progress', 'delivered', 'delivery_failed'\)/i);
  });
});
