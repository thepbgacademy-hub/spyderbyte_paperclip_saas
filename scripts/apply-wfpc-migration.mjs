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
  const { rows } = await client.query(
    "select table_schema, table_name from information_schema.tables where table_schema = 'wfpc' order by table_name"
  );
  console.log(
    JSON.stringify(
      {
        schema: "wfpc",
        migrationApplied: !existing.rows[0]?.exists,
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
