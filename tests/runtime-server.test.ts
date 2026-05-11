import { EventEmitter } from "node:events";
import type { IncomingMessage, ServerResponse } from "node:http";
import { describe, expect, it, vi } from "vitest";

import { createNodeRequestListener, loadRuntimeEnv } from "../src/api/runtime-server.js";

describe("runtime server", () => {
  it("loads explicit split-origin runtime settings", () => {
    expect(
      loadRuntimeEnv({
        SUPABASE_DB_URL: "postgresql://postgres.tenant:pw@187.77.19.83:5432/postgres",
        SUPABASE_DB_SSL: "false",
        WF_ALLOWED_ORIGINS: "https://www.spyderbyte.cloud, https://portal.spyderbyte.cloud",
        WF_API_PORT: "8081"
      })
    ).toEqual({
      supabaseDbUrl: "postgresql://postgres.tenant:pw@187.77.19.83:5432/postgres",
      supabaseDbSsl: "false",
      allowedOrigins: ["https://www.spyderbyte.cloud", "https://portal.spyderbyte.cloud"],
      apiPort: 8081
    });
  });

  it("rejects wildcard portal origins for authenticated APIs", () => {
    expect(() =>
      loadRuntimeEnv({
        SUPABASE_DB_URL: "postgresql://postgres.tenant:pw@187.77.19.83:5432/postgres",
        WF_ALLOWED_ORIGINS: "*"
      })
    ).toThrow(/WF_ALLOWED_ORIGINS/);
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
