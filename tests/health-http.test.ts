import { describe, expect, it } from "vitest";

import { createHealthHttpHandler } from "../src/api/health-http.js";

describe("health HTTP handler", () => {
  it("returns a safe health payload without an origin", async () => {
    const handler = createHealthHttpHandler({
      allowedOrigins: ["https://portal.spyderbyte.cloud"]
    });

    const response = await handler({
      method: "GET",
      path: "/health",
      headers: {},
      bodyByteLength: 0
    });

    expect(response.status).toBe(200);
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.body).toEqual({ status: "ok", service: "wealth_factory_api" });
  });

  it("answers allowed preflight requests and ignores untrusted origin on GET health checks", async () => {
    const handler = createHealthHttpHandler({
      allowedOrigins: ["https://portal.spyderbyte.cloud"]
    });

    const preflight = await handler({
      method: "OPTIONS",
      path: "/api/health",
      headers: { origin: "https://portal.spyderbyte.cloud" },
      bodyByteLength: 0
    });
    const untrusted = await handler({
      method: "GET",
      path: "/api/health",
      headers: { origin: "https://evil.example" },
      bodyByteLength: 0
    });

    expect(preflight.status).toBe(204);
    expect(preflight.headers["access-control-allow-origin"]).toBe("https://portal.spyderbyte.cloud");
    expect(untrusted.status).toBe(200);
    expect(untrusted.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("reports degraded readiness when a dependency check fails", async () => {
    const handler = createHealthHttpHandler({
      allowedOrigins: ["https://portal.spyderbyte.cloud"],
      readinessCheck: async () => {
        throw new Error("db_down");
      }
    });

    const response = await handler({
      method: "GET",
      path: "/api/health",
      headers: { origin: "https://portal.spyderbyte.cloud" },
      bodyByteLength: 0
    });

    expect(response.status).toBe(503);
    expect(response.body).toEqual({ status: "degraded", service: "wealth_factory_api" });
  });
});
