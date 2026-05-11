import { EventEmitter } from "node:events";
import type { IncomingMessage, ServerResponse } from "node:http";
import { describe, expect, it, vi } from "vitest";

import { createDashboardRuntime, createNodeRequestListener, loadRuntimeEnv } from "../src/api/runtime-server.js";

vi.mock("../src/db/postgres-client.js", () => ({
  createPgPool: vi.fn(() => ({
    query: vi.fn(),
    connect: vi.fn(),
    end: vi.fn().mockResolvedValue(undefined)
  })),
  createPgPoolQueryClient: vi.fn(() => ({ query: vi.fn() })),
  createPgTransactionRunner: vi.fn(() => ({ withTransaction: vi.fn() }))
}));

vi.mock("../src/db/supabase-repositories.js", () => ({
  createSupabaseRepositories: vi.fn(() => ({
    requireTenantMember: vi.fn(),
    listWorkflows: vi.fn(),
    listPackages: vi.fn(),
    listArtifacts: vi.fn(),
    listProviderConnections: vi.fn()
  }))
}));

vi.mock("../src/workflows/queue-outbox-pump.js", () => ({
  createQueueOutboxPump: vi.fn(() => ({
    start: vi.fn(),
    stop: vi.fn()
  }))
}));

describe("runtime server", () => {
  it("loads explicit split-origin runtime settings", () => {
    expect(
      loadRuntimeEnv({
        SUPABASE_DB_URL: "postgresql://postgres.tenant:pw@187.77.19.83:5432/postgres",
        SUPABASE_DB_SSL: "false",
        WF_ALLOWED_ORIGINS: "https://www.spyderbyte.cloud, https://portal.spyderbyte.cloud",
        WF_API_PORT: "8081",
        WF_VAULT_MASTER_KEY: "test-master-key-with-enough-length"
      })
    ).toMatchObject({
      supabaseDbUrl: "postgresql://postgres.tenant:pw@187.77.19.83:5432/postgres",
      supabaseDbSsl: "false",
      allowedOrigins: ["https://www.spyderbyte.cloud", "https://portal.spyderbyte.cloud"],
      apiPort: 8081,
      vaultMasterKey: "test-master-key-with-enough-length"
    });
  });

  it("rejects wildcard portal origins for authenticated APIs", () => {
    expect(() =>
      loadRuntimeEnv({
        SUPABASE_DB_URL: "postgresql://postgres.tenant:pw@187.77.19.83:5432/postgres",
        WF_ALLOWED_ORIGINS: "*",
        WF_VAULT_MASTER_KEY: "test-master-key-with-enough-length"
      })
    ).toThrow(/WF_ALLOWED_ORIGINS/);
  });

  it("requires a vault master key for runtime credential storage", () => {
    expect(() =>
      loadRuntimeEnv({
        SUPABASE_DB_URL: "postgresql://postgres.tenant:pw@187.77.19.83:5432/postgres",
        WF_ALLOWED_ORIGINS: "https://www.spyderbyte.cloud"
      })
    ).toThrow(/WF_VAULT_MASTER_KEY/);
  });

  it("adapts Node requests to the guarded dashboard HTTP handler", async () => {
    const handler = vi.fn().mockResolvedValue({
      status: 200,
      headers: { "x-content-type-options": "nosniff" },
      body: { ok: true }
    });
    const request = createRequest({
      method: "GET",
      url: "/api/dashboard?tab=runs",
      headers: {
        authorization: "Bearer token",
        origin: "https://www.spyderbyte.cloud",
        "content-length": "0",
        "x-forwarded-for": "203.0.113.7, 10.0.0.1"
      }
    });
    const response = createResponse();

    createNodeRequestListener(handler)(request as unknown as IncomingMessage, response as unknown as ServerResponse);
    await response.finished;

    expect(handler).toHaveBeenCalledWith({
      method: "GET",
      path: "/api/dashboard",
      headers: {
        authorization: "Bearer token",
        origin: "https://www.spyderbyte.cloud"
      },
      bodyByteLength: 0,
      ip: "127.0.0.1"
    });
    expect(response.statusCode).toBe(200);
    expect(response.body).toBe(JSON.stringify({ ok: true }));
  });

  it("wires the durable workflow outbox pump when a queue enqueuer is provided", async () => {
    const { createQueueOutboxPump } = await import("../src/workflows/queue-outbox-pump.js");
    const runtime = createDashboardRuntime({
      env: {
        supabaseDbUrl: "postgresql://postgres.tenant:pw@187.77.19.83:5432/postgres",
        supabaseDbSsl: "false",
        allowedOrigins: ["https://www.spyderbyte.cloud"],
        apiPort: 8081,
        vaultMasterKey: "test-master-key-with-enough-length",
        runtimeEnv: {}
      },
      auth: { authenticate: vi.fn() },
      workflowQueueEnqueuer: { enqueueOnce: vi.fn().mockResolvedValue("enqueued") }
    });

    runtime.startWorkers();
    await runtime.close();

    expect(createQueueOutboxPump).toHaveBeenCalled();
    const pump = vi.mocked(createQueueOutboxPump).mock.results[0]?.value;
    expect(pump.start).toHaveBeenCalledOnce();
    expect(pump.stop).toHaveBeenCalledOnce();
  });

  it("wires provider credential registration to the runtime vault path", async () => {
    const runtime = createDashboardRuntime({
      env: {
        supabaseDbUrl: "postgresql://postgres.tenant:pw@187.77.19.83:5432/postgres",
        supabaseDbSsl: "false",
        allowedOrigins: ["https://www.spyderbyte.cloud"],
        apiPort: 8081,
        vaultMasterKey: "test-master-key-with-enough-length",
        runtimeEnv: {}
      },
      auth: { authenticate: vi.fn() }
    });

    expect(runtime.registerProviderCredential).toEqual(expect.any(Function));
    await runtime.close();
  });
});

function createRequest(input: { method: string; url: string; headers: Record<string, string> }) {
  return Object.assign(new EventEmitter(), {
    method: input.method,
    url: input.url,
    headers: input.headers,
    socket: { remoteAddress: "127.0.0.1" }
  });
}

function createResponse() {
  let resolveFinished!: () => void;
  const finished = new Promise<void>((resolve) => {
    resolveFinished = resolve;
  });
  return {
    statusCode: 0,
    headers: {} as Record<string, string>,
    body: "",
    finished,
    writeHead(statusCode: number, headers: Record<string, string>) {
      this.statusCode = statusCode;
      this.headers = headers;
    },
    end(chunk: string) {
      this.body = chunk;
      resolveFinished();
    }
  };
}
