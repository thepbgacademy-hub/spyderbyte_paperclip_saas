import { Client } from "pg";

import type { QueryClient } from "./supabase-repositories.js";

type PgClientLike = {
  query(sql: string, values: readonly unknown[]): Promise<{ rows: unknown[] }>;
};

export function resolvePgSsl(input: { connectionString: string; sslMode?: string }) {
  if (
    input.sslMode === "false" ||
    input.connectionString.includes("localhost") ||
    input.connectionString.includes("127.0.0.1")
  ) {
    return undefined;
  }

  return { rejectUnauthorized: true };
}

export function createPgQueryClient(pgClient: PgClientLike): QueryClient {
  return {
    async query(sql: string, values: readonly unknown[]) {
      const result = await pgClient.query(sql, values);
      return { rows: result.rows };
    }
  };
}

export async function connectPgQueryClient(input: { connectionString: string; sslMode?: string }): Promise<QueryClient & { close(): Promise<void> }> {
  const pgClient = new Client({
    connectionString: input.connectionString,
    ssl: resolvePgSsl(input)
  });
  await pgClient.connect();
  return {
    ...createPgQueryClient(pgClient),
    close: () => pgClient.end()
  };
}
