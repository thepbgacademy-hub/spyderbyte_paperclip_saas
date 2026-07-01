import { describe, expect, it, vi } from "vitest";

import { ApiAuthError } from "../src/api/dashboard-api.js";
import { createDashboardHttpHandler } from "../src/api/dashboard-http.js";

const session = { userId: "user-1", tenantId: "tenant-1", role: "member" as const };

describe("dashboard HTTP boundary", () => {
  it("rejects untrusted origins before resolving dashboard data", async () => {
    const dashboardApi = {
      listDashboard: vi.fn(),
      startWorkflowRun: vi.fn()
    };
    const handler = createDashboardHttpHandler({
      allowedOrigins: ["https://portal.wealthfactory.test", "https://wf-api.wealthfactory.test"],
      dashboardApi,
      rateLimiter: { consume: vi.fn().mockResolvedValue({ allowed: true, remaining: 9, resetAt: 1 }) }
    });

    const response = await handler({
      method: "GET",
      path: "/api/dashboard",
      headers: { origin: "https://evil.example", authorization: "Bearer valid" },
      bodyByteLength: 0,
      ip: "203.0.113.10"
    });

    expect(response.status).toBe(403);
    expect(dashboardApi.listDashboard).not.toHaveBeenCalled();
  });

  it("allows same-origin browser dashboard reads without an explicit origin header", async () => {
    const dashboardApi = {
      startWorkflowRun: vi.fn(),
      listDashboard: vi.fn().mockResolvedValue({
        tenantId: session.tenantId,
        role: session.role,
        workflows: [],
        packages: [],
        artifacts: [],
        providerConnections: [],
        storageConnectors: [],
        platformLoad: {
          level: "light",
          summary: "Light traffic",
          detail: "New workflows should begin processing quickly."
        }
      })
    };
    const handler = createDashboardHttpHandler({
      allowedOrigins: ["https://portal.wealthfactory.test", "https://wf-api.wealthfactory.test"],
      dashboardApi,
      rateLimiter: { consume: vi.fn().mockResolvedValue({ allowed: true, remaining: 9, resetAt: 1 }) }
    });

    const response = await handler({
      method: "GET",
      path: "/api/dashboard",
      headers: {
        authorization: "Bearer valid",
        host: "wf-api.wealthfactory.test",
        referer: "https://wf-api.wealthfactory.test/dashboard",
        "sec-fetch-site": "same-origin"
      },
      bodyByteLength: 0,
      ip: "203.0.113.10"
    });

    expect(response.status).toBe(200);
    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
    expect(dashboardApi.listDashboard).toHaveBeenCalledWith({ authorization: "Bearer valid" });
  });

  it("returns guarded dashboard data with CORS and security headers", async () => {
    const dashboardApi = {
      startWorkflowRun: vi.fn(),
      listDashboard: vi.fn().mockResolvedValue({
        tenantId: session.tenantId,
        role: session.role,
        workflows: [{ id: "wf-connect-first", name: "Connect First Workflow" }],
        packages: [],
        artifacts: [],
        providerConnections: [],
        storageConnectors: [{ id: "storage-1", providerKind: "dropbox", displayName: "Marketing Dropbox", connected: true, publicTarget: { folderLabel: "Exports" } }],
        platformLoad: {
          level: "moderate",
          summary: "Normal traffic",
          detail: "Slight delays are possible while current work clears."
        }
      })
    };
    const handler = createDashboardHttpHandler({
      allowedOrigins: ["https://portal.wealthfactory.test"],
      dashboardApi,
      rateLimiter: { consume: vi.fn().mockResolvedValue({ allowed: true, remaining: 9, resetAt: 1 }) }
    });

    const response = await handler({
      method: "GET",
      path: "/api/dashboard",
      headers: { origin: "https://portal.wealthfactory.test", authorization: "Bearer valid" },
      bodyByteLength: 0,
      ip: "203.0.113.10"
    });

    expect(response.status).toBe(200);
    expect(response.headers["access-control-allow-origin"]).toBe("https://portal.wealthfactory.test");
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.body).toEqual(await dashboardApi.listDashboard.mock.results[0]?.value);
    expect(dashboardApi.listDashboard).toHaveBeenCalledWith({ authorization: "Bearer valid" });
  });

  it("answers authenticated dashboard preflight requests", async () => {
    const dashboardApi = {
      listDashboard: vi.fn(),
      startWorkflowRun: vi.fn()
    };
    const handler = createDashboardHttpHandler({
      allowedOrigins: ["https://portal.wealthfactory.test"],
      dashboardApi,
      rateLimiter: { consume: vi.fn().mockResolvedValue({ allowed: true, remaining: 9, resetAt: 1 }) }
    });

    const response = await handler({
      method: "OPTIONS",
      path: "/api/dashboard",
      headers: { origin: "https://portal.wealthfactory.test" },
      bodyByteLength: 0,
      ip: "203.0.113.10"
    });

    expect(response.status).toBe(204);
    expect(response.headers["access-control-allow-methods"]).toContain("GET");
    expect(response.headers["access-control-allow-methods"]).toContain("POST");
    expect(response.headers["access-control-allow-headers"]).toContain("authorization");
    expect(dashboardApi.listDashboard).not.toHaveBeenCalled();
  });

  it("starts workflow runs through the guarded dashboard HTTP seam", async () => {
    const dashboardApi = {
      listDashboard: vi.fn(),
      startWorkflowRun: vi.fn().mockResolvedValue({ runId: "run-123", queued: true })
    };
    const handler = createDashboardHttpHandler({
      allowedOrigins: ["https://portal.wealthfactory.test"],
      dashboardApi,
      rateLimiter: { consume: vi.fn().mockResolvedValue({ allowed: true, remaining: 9, resetAt: 1 }) }
    });

    const response = await handler({
      method: "POST",
      path: "/api/dashboard/runs",
      headers: {
        origin: "https://portal.wealthfactory.test",
        authorization: "Bearer valid",
        "content-type": "application/json"
      },
      body: { workflowId: "workflow-template-1" },
      bodyByteLength: 33,
      ip: "203.0.113.10"
    });

    expect(response.status).toBe(202);
    expect(response.body).toEqual({ runId: "run-123", queued: true });
    expect(dashboardApi.startWorkflowRun).toHaveBeenCalledWith({
      authorization: "Bearer valid",
      workflowId: "workflow-template-1"
    });
  });

  it("forwards an explicit fresh-run request through the guarded dashboard HTTP seam", async () => {
    const dashboardApi = {
      listDashboard: vi.fn(),
      startWorkflowRun: vi.fn().mockResolvedValue({ runId: "run-456", queued: true })
    };
    const handler = createDashboardHttpHandler({
      allowedOrigins: ["https://portal.wealthfactory.test"],
      dashboardApi,
      rateLimiter: { consume: vi.fn().mockResolvedValue({ allowed: true, remaining: 9, resetAt: 1 }) }
    });

    const response = await handler({
      method: "POST",
      path: "/api/dashboard/runs",
      headers: {
        origin: "https://portal.wealthfactory.test",
        authorization: "Bearer valid",
        "content-type": "application/json"
      },
      body: { workflowId: "workflow-template-1", freshRun: true },
      bodyByteLength: 50,
      ip: "203.0.113.10"
    });

    expect(response.status).toBe(202);
    expect(response.body).toEqual({ runId: "run-456", queued: true });
    expect(dashboardApi.startWorkflowRun).toHaveBeenCalledWith({
      authorization: "Bearer valid",
      workflowId: "workflow-template-1",
      freshRun: true
    });
  });

  it("fails closed on invalid dashboard run-start payloads", async () => {
    const dashboardApi = {
      listDashboard: vi.fn(),
      startWorkflowRun: vi.fn()
    };
    const handler = createDashboardHttpHandler({
      allowedOrigins: ["https://portal.wealthfactory.test"],
      dashboardApi,
      rateLimiter: { consume: vi.fn().mockResolvedValue({ allowed: true, remaining: 9, resetAt: 1 }) }
    });

    const response = await handler({
      method: "POST",
      path: "/api/dashboard/runs",
      headers: {
        origin: "https://portal.wealthfactory.test",
        authorization: "Bearer valid",
        "content-type": "application/json"
      },
      body: {},
      bodyByteLength: 2,
      ip: "203.0.113.10"
    });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ code: "invalid_request" });
    expect(dashboardApi.startWorkflowRun).not.toHaveBeenCalled();
  });

  it("maps bounded run-start conflicts without flattening them into 500s", async () => {
    const dashboardApi = {
      listDashboard: vi.fn(),
      startWorkflowRun: vi.fn().mockRejectedValue(Object.assign(new Error("duplicate"), { code: "conflict" }))
    };
    const handler = createDashboardHttpHandler({
      allowedOrigins: ["https://portal.wealthfactory.test"],
      dashboardApi,
      rateLimiter: { consume: vi.fn().mockResolvedValue({ allowed: true, remaining: 9, resetAt: 1 }) }
    });

    const response = await handler({
      method: "POST",
      path: "/api/dashboard/runs",
      headers: {
        origin: "https://portal.wealthfactory.test",
        authorization: "Bearer valid",
        "content-type": "application/json"
      },
      body: { workflowId: "workflow-template-1" },
      bodyByteLength: 33,
      ip: "203.0.113.10"
    });

    expect(response.status).toBe(409);
    expect(response.body).toEqual({ code: "conflict" });
  });

  it("rate limits dashboard requests before hitting repositories", async () => {
    const dashboardApi = {
      listDashboard: vi.fn(),
      startWorkflowRun: vi.fn()
    };
    const handler = createDashboardHttpHandler({
      allowedOrigins: ["https://portal.wealthfactory.test"],
      dashboardApi,
      rateLimiter: { consume: vi.fn().mockResolvedValue({ allowed: false, remaining: 0, resetAt: 1 }) }
    });

    const response = await handler({
      method: "GET",
      path: "/api/dashboard",
      headers: { origin: "https://portal.wealthfactory.test", authorization: "Bearer valid" },
      bodyByteLength: 0,
      ip: "203.0.113.10"
    });

    expect(response.status).toBe(429);
    expect(response.headers["retry-after"]).toBe("0");
    expect(dashboardApi.listDashboard).not.toHaveBeenCalled();
  });

  it("separates dashboard auth failures from internal service faults", async () => {
    const unauthorizedHandler = createDashboardHttpHandler({
      allowedOrigins: ["https://portal.wealthfactory.test"],
      dashboardApi: { listDashboard: vi.fn().mockRejectedValue(new ApiAuthError()), startWorkflowRun: vi.fn() },
      rateLimiter: { consume: vi.fn().mockResolvedValue({ allowed: true, remaining: 9, resetAt: 1 }) }
    });

    const unauthorizedResponse = await unauthorizedHandler({
      method: "GET",
      path: "/api/dashboard",
      headers: { origin: "https://portal.wealthfactory.test", authorization: "Bearer valid" },
      bodyByteLength: 0,
      ip: "203.0.113.10"
    });

    expect(unauthorizedResponse.status).toBe(401);

    const unavailableHandler = createDashboardHttpHandler({
      allowedOrigins: ["https://portal.wealthfactory.test"],
      dashboardApi: { listDashboard: vi.fn().mockRejectedValue(new Error("database unavailable")), startWorkflowRun: vi.fn() },
      rateLimiter: { consume: vi.fn().mockResolvedValue({ allowed: true, remaining: 9, resetAt: 1 }) }
    });

    const unavailableResponse = await unavailableHandler({
      method: "GET",
      path: "/api/dashboard",
      headers: { origin: "https://portal.wealthfactory.test", authorization: "Bearer valid" },
      bodyByteLength: 0,
      ip: "203.0.113.10"
    });

    expect(unavailableResponse.status).toBe(500);
    expect(unavailableResponse.body).toEqual({ code: "service_unavailable" });
  });
});
