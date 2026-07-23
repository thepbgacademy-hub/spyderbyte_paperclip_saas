// Applies the auth shim plus every supabase/migrations/*.sql file, in
// filename order, against a disposable LOCAL Postgres only. This is the
// TASK-055 walking-skeleton counterpart to scripts/apply-wfpc-migration.mjs
// (which targets SUPABASE_DB_URL and does not cover 0036/0037). It must
// never be pointed at SUPABASE_DB_URL (CON-012 / DEC-040): it refuses to run
// if the target connection string looks like a non-local host.
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import { Client } from "pg";

/* global console */

const DEFAULT_LOCAL_PG_URL = "postgresql://postgres:postgres@127.0.0.1:55432/wf_skeleton";

function resolveTargetConnectionString() {
  const target = process.env.WF_LOCAL_PG_URL?.trim() || DEFAULT_LOCAL_PG_URL;
  const isLocal = target.includes("localhost") || target.includes("127.0.0.1");
  if (!isLocal) {
    throw new Error(
      `Refusing to apply migrations: connection string does not look local ("${target}"). ` +
        "This applier must only ever target a disposable local Postgres (CON-012)."
    );
  }
  if (process.env.SUPABASE_DB_URL && target === process.env.SUPABASE_DB_URL) {
    throw new Error("Refusing to apply migrations: target connection string equals SUPABASE_DB_URL (CON-012).");
  }
  return target;
}

async function main() {
  const connectionString = resolveTargetConnectionString();
  const client = new Client({ connectionString });
  await client.connect();

  try {
    const shimPath = resolve("scripts/local-postgres-auth-shim.sql");
    await client.query(readFileSync(shimPath, "utf8"));
    console.log(JSON.stringify({ applied: "auth-shim", path: shimPath }));

    const migrationsDir = resolve("supabase/migrations");
    const migrationFiles = readdirSync(migrationsDir)
      .filter((name) => name.endsWith(".sql"))
      .sort();

    for (const fileName of migrationFiles) {
      const filePath = resolve(migrationsDir, fileName);
      await client.query(readFileSync(filePath, "utf8"));
      console.log(JSON.stringify({ applied: fileName }));
    }

    const { rows } = await client.query(
      "select table_name from information_schema.tables where table_schema = 'wfpc' order by table_name"
    );
    console.log(
      JSON.stringify(
        {
          schema: "wfpc",
          migrationCount: migrationFiles.length,
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
}

await main();
