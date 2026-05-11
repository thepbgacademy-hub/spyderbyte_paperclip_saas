import { readFileSync } from "node:fs";
import { Client } from "pg";

/* global console */

const env = readFileSync(".env", "utf8")
  .split(/\r?\n/)
  .filter((line) => line.trim() && !line.trim().startsWith("#"))
  .map((line) => line.split(/=(.*)/s).slice(0, 2))
  .reduce((acc, [key, value]) => {
    acc[key.trim()] = value ?? "";
    return acc;
  }, {});

const connectionString = env.SUPABASE_DB_URL;
if (!connectionString || connectionString === "PLACE_HOLDER") {
  throw new Error("SUPABASE_DB_URL is required");
}

const ssl =
  env.SUPABASE_DB_SSL === "false" ||
  connectionString.includes("localhost") ||
  connectionString.includes("127.0.0.1")
    ? undefined
    : { rejectUnauthorized: false };

const client = new Client({
  connectionString,
  ssl
});
let closing = false;
client.on("error", (error) => {
  if (!closing) {
    throw error;
  }
});

await client.connect();
try {
  const existing = await client.query(
    "select exists (select 1 from information_schema.schemata where schema_name = 'wfpc') as exists"
  );
  if (!existing.rows[0]?.exists) {
    await client.query(readFileSync("supabase/migrations/0001_initial_tenant_model.sql", "utf8"));
  }
  const acidExisting = await client.query(
    `select
      exists (select 1 from information_schema.tables where table_schema = 'wfpc' and table_name = 'workflow_run_reservations') as has_table,
      exists (select 1 from pg_indexes where schemaname = 'wfpc' and indexname = 'workflow_run_reservations_idempotency_unique') as has_idempotency_index,
      exists (select 1 from pg_indexes where schemaname = 'wfpc' and indexname = 'workflow_run_reservations_run_id_unique') as has_run_id_unique,
      exists (select 1 from pg_indexes where schemaname = 'wfpc' and indexname = 'secret_references_active_unique') as has_active_secret_index,
      exists (select 1 from pg_indexes where schemaname = 'wfpc' and indexname = 'secret_references_tenant_secret_ref_unique') as has_secret_ref_index,
      exists (select 1 from pg_indexes where schemaname = 'wfpc' and indexname = 'workflow_runs_status_guard_idx') as has_status_index,
      exists (select 1 from pg_indexes where schemaname = 'wfpc' and indexname = 'workflow_templates_package_idx') as has_workflow_package_index,
      exists (select 1 from information_schema.columns where table_schema = 'wfpc' and table_name = 'workflow_templates' and column_name = 'package_id') as has_workflow_package_column,
      exists (select 1 from pg_constraint where conname = 'workflow_templates_package_fk' and conrelid = 'wfpc.workflow_templates'::regclass) as has_workflow_package_fk,
      exists (select 1 from information_schema.columns where table_schema = 'wfpc' and table_name = 'workflow_run_reservations' and column_name = 'run_id' and is_nullable = 'NO') as has_run_id_not_null,
      exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'wfpc' and c.relname = 'workflow_run_reservations' and c.relrowsecurity) as has_rls`
  );
  const acidReady = Object.values(acidExisting.rows[0] ?? {}).every(Boolean);
  if (!acidReady) {
    await client.query(readFileSync("supabase/migrations/0002_acid_race_guards.sql", "utf8"));
  }
  const purchaseExisting = await client.query(
    `select
      exists (select 1 from information_schema.tables where table_schema = 'wfpc' and table_name = 'tenant_package_purchases') as has_table,
      exists (select 1 from pg_indexes where schemaname = 'wfpc' and indexname = 'tenant_package_purchases_active_idx') as has_active_index,
      exists (select 1 from pg_constraint where conname = 'tenant_package_purchases_tenant_id_package_id_key' and conrelid = to_regclass('wfpc.tenant_package_purchases')) as has_unique_purchase,
      exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'wfpc' and c.relname = 'tenant_package_purchases' and c.relrowsecurity) as has_rls,
      exists (select 1 from pg_policies where schemaname = 'wfpc' and tablename = 'tenant_package_purchases' and policyname = 'members can read tenant package purchases') as has_member_read_policy`
  );
  const purchaseReady = Object.values(purchaseExisting.rows[0] ?? {}).every(Boolean);
  if (!purchaseReady) {
    await client.query(readFileSync("supabase/migrations/0003_package_purchase_guards.sql", "utf8"));
  }
  const outboxExisting = await client.query(
    `select
      exists (select 1 from information_schema.tables where table_schema = 'wfpc' and table_name = 'workflow_queue_outbox') as has_table,
      exists (select 1 from information_schema.columns where table_schema = 'wfpc' and table_name = 'workflow_queue_outbox' and column_name = 'created_by_user_id' and is_nullable = 'NO') as has_user_column,
      exists (select 1 from information_schema.columns where table_schema = 'wfpc' and table_name = 'workflow_queue_outbox' and column_name = 'status' and is_nullable = 'NO' and column_default like '%pending%') as has_status_column,
      exists (select 1 from information_schema.columns where table_schema = 'wfpc' and table_name = 'workflow_queue_outbox' and column_name = 'idempotency_key' and is_nullable = 'NO') as has_idempotency_column,
      exists (select 1 from information_schema.columns where table_schema = 'wfpc' and table_name = 'workflow_queue_outbox' and column_name = 'attempts' and is_nullable = 'NO') as has_attempts_column,
      exists (select 1 from information_schema.columns where table_schema = 'wfpc' and table_name = 'workflow_queue_outbox' and column_name = 'available_at' and is_nullable = 'NO') as has_available_at_column,
      exists (select 1 from information_schema.columns where table_schema = 'wfpc' and table_name = 'workflow_queue_outbox' and column_name = 'created_at' and is_nullable = 'NO') as has_created_at_column,
      exists (select 1 from information_schema.columns where table_schema = 'wfpc' and table_name = 'workflow_queue_outbox' and column_name = 'updated_at' and is_nullable = 'NO') as has_updated_at_column,
      exists (select 1 from information_schema.columns where table_schema = 'wfpc' and table_name = 'workflow_queue_outbox' and column_name = 'claim_token') as has_claim_token,
      exists (select 1 from information_schema.columns where table_schema = 'wfpc' and table_name = 'workflow_queue_outbox' and column_name = 'claimed_at') as has_claimed_at_column,
      exists (select 1 from information_schema.columns where table_schema = 'wfpc' and table_name = 'workflow_queue_outbox' and column_name = 'enqueued_at') as has_enqueued_at_column,
      exists (select 1 from information_schema.columns where table_schema = 'wfpc' and table_name = 'workflow_queue_outbox' and column_name = 'last_error') as has_last_error_column,
      exists (select 1 from pg_indexes where schemaname = 'wfpc' and indexname = 'workflow_queue_outbox_pending_idx') as has_pending_index,
      exists (select 1 from pg_indexes where schemaname = 'wfpc' and indexname = 'workflow_queue_outbox_claimed_idx') as has_claimed_index,
      exists (select 1 from pg_constraint where conname = 'workflow_queue_outbox_tenant_id_run_id_key' and conrelid = to_regclass('wfpc.workflow_queue_outbox')) as has_run_unique,
      exists (select 1 from pg_constraint where conname = 'workflow_queue_outbox_tenant_id_workflow_template_id_idempo_key' and conrelid = to_regclass('wfpc.workflow_queue_outbox')) as has_idempotency_unique,
      exists (select 1 from pg_constraint where conrelid = to_regclass('wfpc.workflow_queue_outbox') and contype = 'p') as has_primary_key,
      exists (select 1 from pg_constraint where conrelid = to_regclass('wfpc.workflow_queue_outbox') and pg_get_constraintdef(oid) like '%wfpc.workflow_runs%') as has_run_fk,
      exists (select 1 from pg_constraint where conrelid = to_regclass('wfpc.workflow_queue_outbox') and pg_get_constraintdef(oid) like '%workflow_template_id, tenant_id%') as has_workflow_template_fk,
      exists (
        select 1
        from pg_constraint
        where conname = 'workflow_queue_outbox_status_check'
          and conrelid = to_regclass('wfpc.workflow_queue_outbox')
          and pg_get_constraintdef(oid) like '%claimed%'
      ) as has_status_check,
      exists (select 1 from pg_constraint where conname = 'workflow_queue_outbox_attempts_check' and conrelid = to_regclass('wfpc.workflow_queue_outbox')) as has_attempts_check,
      exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'wfpc' and c.relname = 'workflow_queue_outbox' and c.relrowsecurity) as has_rls`
  );
  const outboxReady = Object.values(outboxExisting.rows[0] ?? {}).every(Boolean);
  if (!outboxReady) {
    await client.query(readFileSync("supabase/migrations/0004_workflow_queue_outbox.sql", "utf8"));
  }
  const vaultExisting = await client.query(
    `select
      exists (select 1 from information_schema.tables where table_schema = 'wfpc_private' and table_name = 'vault_secrets') as has_table,
      exists (select 1 from pg_indexes where schemaname = 'wfpc_private' and indexname = 'vault_secrets_tenant_id_idx') as has_tenant_index,
      exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'wfpc_private' and c.relname = 'vault_secrets' and c.relrowsecurity) as has_rls`
  );
  const vaultReady = Object.values(vaultExisting.rows[0] ?? {}).every(Boolean);
  if (!vaultReady) {
    await client.query(readFileSync("supabase/migrations/0005_private_encrypted_vault.sql", "utf8"));
  }
  const vaultKindExisting = await client.query(
    `select exists (
      select 1
      from information_schema.columns
      where table_schema = 'wfpc_private'
        and table_name = 'vault_secrets'
        and column_name = 'provider_kind'
        and data_type = 'text'
    ) as ready`
  );
  const vaultKindReady = Boolean(vaultKindExisting.rows[0]?.ready);
  if (!vaultKindReady) {
    await client.query(readFileSync("supabase/migrations/0006_vault_storage_secret_kinds.sql", "utf8"));
  }
  const storageSecretExisting = await client.query(
    `select
      exists (select 1 from information_schema.tables where table_schema = 'wfpc_private' and table_name = 'storage_connector_secrets') as has_table,
      exists (select 1 from pg_indexes where schemaname = 'wfpc_private' and indexname = 'storage_connector_secrets_tenant_id_idx') as has_tenant_index,
      exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'wfpc_private' and c.relname = 'storage_connector_secrets' and c.relrowsecurity) as has_rls`
  );
  const storageSecretReady = Object.values(storageSecretExisting.rows[0] ?? {}).every(Boolean);
  if (!storageSecretReady) {
    await client.query(readFileSync("supabase/migrations/0007_private_storage_connector_secrets.sql", "utf8"));
  }
  const storageConnectorTenantFkExisting = await client.query(
    `select
      exists (select 1 from pg_constraint where conname = 'storage_connectors_id_tenant_id_key' and conrelid = to_regclass('wfpc.storage_connectors')) as has_unique_connector_tenant,
      exists (select 1 from pg_constraint where conname = 'storage_connector_secrets_connector_tenant_fkey' and conrelid = to_regclass('wfpc_private.storage_connector_secrets')) as has_connector_tenant_fk`
  );
  const storageConnectorTenantFkReady = Object.values(storageConnectorTenantFkExisting.rows[0] ?? {}).every(Boolean);
  if (!storageConnectorTenantFkReady) {
    await client.query(readFileSync("supabase/migrations/0008_storage_connector_tenant_fk.sql", "utf8"));
  }
  const { rows } = await client.query(
    "select table_schema, table_name from information_schema.tables where table_schema = 'wfpc' order by table_name"
  );
  console.log(
    JSON.stringify(
      {
        schema: "wfpc",
        migrationApplied:
          !existing.rows[0]?.exists ||
          !acidReady ||
          !purchaseReady ||
          !outboxReady ||
          !vaultReady ||
          !vaultKindReady ||
          !storageSecretReady ||
          !storageConnectorTenantFkReady,
        tableCount: rows.length,
        tables: rows.map((row) => row.table_name)
      },
      null,
      2
    )
  );
} finally {
  closing = true;
  await client.end();
}
