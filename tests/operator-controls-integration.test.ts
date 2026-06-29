import { describe, expect, it, vi } from "vitest";

import { createOperatorHttpHandler } from "../src/api/operator-http.js";
import { createPostgresOperatorDependencies } from "../src/operators/operator-deps.js";
import { createOperatorService } from "../src/operators/operator-service.js";

const baseRequest = {
  headers: { authorization: "Bearer token", origin: "https://portal.example.test" },
  bodyByteLength: 2,
  ip: "127.0.0.1"
};

describe("operator controls integration proof", () => {
  it("pauses a tenant through HTTP, durable authorization, Postgres tenant controls, and audit", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ tenant_id: "tenant-session" }] })
      .mockResolvedValueOnce({ rows: [] });
    const audit = vi.fn().mockResolvedValue(undefined);
    const handler = createIntegratedHandler({ query, audit });

    const response = await handler({
      ...baseRequest,
      method: "POST",
      path: "/api/operator/tenants/tenant-url-ignored/pause",
      body: { tenantId: "tenant-body-ignored", reason: "operator maintenance" }
    });

    expect(response).toMatchObject({ status: 204, body: null });
    expect(String(query.mock.calls[0]?.[0])).toMatch(/from wfpc\.tenant_memberships/i);
    expect(query.mock.calls[0]?.[1]).toEqual(["tenant-session", "operator-1"]);
    expect(String(query.mock.calls[1]?.[0])).toMatch(/update wfpc\.tenants[\s\S]+set paused_at = now\(\)/i);
    expect(query.mock.calls[1]?.[1]).toEqual(["tenant-session"]);
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-session",
        actorUserId: "operator-1",
        eventType: "operator.tenant_paused",
        entityType: "tenant",
        metadata: { reason: "operator maintenance" }
      })
    );
  });

  it("resumes a tenant through the same integrated durable operator path", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ tenant_id: "tenant-session" }] })
      .mockResolvedValueOnce({ rows: [] });
    const audit = vi.fn().mockResolvedValue(undefined);
    const handler = createIntegratedHandler({ query, audit });

    const response = await handler({
      ...baseRequest,
      method: "POST",
      path: "/api/operator/tenants/tenant-session/resume",
      body: { reason: "operator cleared" }
    });

    expect(response).toMatchObject({ status: 204, body: null });
    expect(String(query.mock.calls[1]?.[0])).toMatch(/update wfpc\.tenants[\s\S]+set paused_at = null/i);
    expect(query.mock.calls[1]?.[1]).toEqual(["tenant-session"]);
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-session",
        actorUserId: "operator-1",
        eventType: "operator.tenant_resumed",
        entityType: "tenant",
        metadata: { reason: "operator cleared" }
      })
    );
  });

  it("fails closed before tenant mutation when durable membership is missing", async () => {
    const query = vi.fn().mockResolvedValueOnce({ rows: [] });
    const audit = vi.fn().mockResolvedValue(undefined);
    const handler = createIntegratedHandler({ query, audit });

    const response = await handler({
      ...baseRequest,
      method: "POST",
      path: "/api/operator/tenants/tenant-session/pause",
      body: { reason: "operator maintenance" }
    });

    expect(response).toMatchObject({ status: 403, body: { code: "operator_access_denied" } });
    expect(query).toHaveBeenCalledTimes(1);
    expect(String(query.mock.calls[0]?.[0])).toMatch(/from wfpc\.tenant_memberships/i);
    expect(audit).not.toHaveBeenCalled();
  });

  it("keeps deferred operator commands explicitly unavailable through the integrated stack", async () => {
    const query = vi.fn().mockResolvedValueOnce({ rows: [{ tenant_id: "tenant-session" }] });
    const audit = vi.fn().mockResolvedValue(undefined);
    const handler = createIntegratedHandler({ query, audit });

    const response = await handler({
      ...baseRequest,
      method: "POST",
      path: "/api/operator/tenants/tenant-session/secrets/vault%3A%2F%2Fsecret-1/rotate",
      body: { reason: "scheduled rotation" }
    });

    expect(response).toMatchObject({ status: 501, body: { code: "operator_operation_not_implemented" } });
    expect(JSON.stringify(response.body)).not.toContain("vault://secret-1");
    expect(audit).not.toHaveBeenCalled();
  });
});

function createIntegratedHandler(options: {
  query: ReturnType<typeof vi.fn>;
  audit: ReturnType<typeof vi.fn>;
}) {
  const operatorService = createOperatorService(createPostgresOperatorDependencies({ query: options.query }, options.audit));
  return createOperatorHttpHandler({
    allowedOrigins: ["https://portal.example.test"],
    authenticate: vi.fn().mockResolvedValue({ tenantId: "tenant-session", userId: "operator-1", role: "member" }),
    operatorService,
    rateLimiter: { consume: vi.fn().mockResolvedValue({ allowed: true, remaining: 99, resetAt: Date.now() + 60_000 }) }
  });
}
