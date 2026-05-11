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
  const { rows } = await client.query(
    "select table_schema, table_name from information_schema.tables where table_schema = 'wfpc' order by table_name"
  );
  console.log(
    JSON.stringify(
      {
        schema: "wfpc",
        migrationApplied: !existing.rows[0]?.exists || !acidReady,
        tableCount: rows.length,
        tables: rows.map((row) => row.table_name)
      },
      null,
      2
    )
  );
} finally {
  await client.end();
}
