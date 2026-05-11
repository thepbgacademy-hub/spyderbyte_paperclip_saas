import { describe, expect, it, vi } from "vitest";

import { createPgQueryClient, createPgTransactionRunner, resolvePgSsl } from "../src/db/postgres-client.js";

describe("Postgres query client", () => {
  it("disables SSL for self-hosted Supabase pooler when configured", () => {
    expect(resolvePgSsl({ connectionString: "postgresql://postgres.tenant:pw@187.77.19.83:5432/postgres", sslMode: "false" })).toBeUndefined();
  });

  it("requires verified TLS by default for remote Postgres connections", () => {
    expect(resolvePgSsl({ connectionString: "postgresql://postgres:pw@db.example.com:5432/postgres" })).toEqual({ rejectUnauthorized: true });
  });

  it("adapts pg client query results to repository query shape", async () => {
    const pgClient = {
      query: async (_sql: string, _values: readonly unknown[]) => ({ rows: [{ value: 1 }] })
    };
    const client = createPgQueryClient(pgClient);

    await expect(client.query("select 1", [])).resolves.toEqual({ rows: [{ value: 1 }] });
  });

  it("pins transactions to one leased pool client", async () => {
    const leasedClient = {
      query: vi.fn().mockResolvedValue({ rows: [{ ok: true }] }),
      release: vi.fn()
    };
    const pool = {
      connect: vi.fn().mockResolvedValue(leasedClient)
    };
    const runner = createPgTransactionRunner(pool);

    await expect(runner.withTransaction((transaction) => transaction.query("select 1", []))).resolves.toEqual({ rows: [{ ok: true }] });

    expect(pool.connect).toHaveBeenCalledOnce();
    expect(leasedClient.query.mock.calls.map(([sql]) => sql)).toEqual(["begin", "select 1", "commit"]);
    expect(leasedClient.release).toHaveBeenCalledOnce();
  });
});
