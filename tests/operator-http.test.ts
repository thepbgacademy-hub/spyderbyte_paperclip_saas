import { describe, expect, it, vi } from "vitest";

import { createOperatorHttpHandler } from "../src/api/operator-http.js";
import { createOperatorService } from "../src/operators/operator-service.js";

const baseRequest = {
  headers: { authorization: "Bearer token", origin: "https://portal.example.test" },
  bodyByteLength: 2,
  ip: "127.0.0.1"
};

describe("operator HTTP safety surface", () => {
  it("fails closed before service dispatch when the verified session is not an operator", async () => {
    const deps = operatorDeps();
    const operatorService = createOperatorService(deps);
    const handler = createOperatorHttpHandler({
      allowedOrigins: ["https://portal.example.test"],
      authenticate: vi.fn().mockResolvedValue({ tenantId: "tenant-session", userId: "user-member", role: "member" }),
      operatorService,
      rateLimiter: allowAllRateLimiter()
    });

    const response = await handler({
      ...baseRequest,
      method: "POST",
      path: "/api/operator/tenants/tenant-other/pause",
      body: { tenantId: "tenant-other", reason: "maintenance" }
    });

    expect(response).toMatchObject({ status: 403, body: { code: "operator_access_denied" } });
    expect(deps.isOperator).not.toHaveBeenCalled();
    expect(deps.tenantControls.pause).not.toHaveBeenCalled();
  });

  it("uses the verified session tenant instead of trusting a body-supplied tenant id", async () => {
    const deps = operatorDeps();
    const operatorService = createOperatorService(deps);
    const handler = createOperatorHttpHandler({
      allowedOrigins: ["https://portal.example.test"],
      authenticate: vi.fn().mockResolvedValue({ tenantId: "tenant-session", userId: "operator-1", role: "operator" }),
      operatorService,
      rateLimiter: allowAllRateLimiter()
    });

    const response = await handler({
      ...baseRequest,
      method: "POST",
      path: "/api/operator/tenants/tenant-other/pause",
      body: { tenantId: "tenant-other", reason: "maintenance" }
    });

    expect(response).toMatchObject({ status: 204, body: null });
    expect(deps.tenantControls.pause).toHaveBeenCalledWith({ tenantId: "tenant-session", reason: "maintenance" });
    expect(deps.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-session",
        actorUserId: "operator-1",
        eventType: "operator.tenant_paused"
      })
    );
  });

  it("sanitizes job inspection and dead-letter responses", async () => {
    const deps = operatorDeps({
      jobs: {
        inspect: vi.fn().mockResolvedValue({
          id: "job-1",
          tenantId: "tenant-session",
          status: "failed",
          attempts: 3,
          payload: { secret: "raw" },
          rawError: "boom"
        }),
        retry: vi.fn(),
        cancel: vi.fn(),
        deadLetters: vi.fn().mockResolvedValue([
          {
            id: "job-2",
            tenantId: "tenant-session",
            failedAt: "2026-06-29T00:00:00.000Z",
            payload: { secret: "raw" }
          }
        ])
      }
    });
    const operatorService = createOperatorService(deps);
    const handler = createOperatorHttpHandler({
      allowedOrigins: ["https://portal.example.test"],
      authenticate: vi.fn().mockResolvedValue({ tenantId: "tenant-session", userId: "operator-1", role: "operator" }),
      operatorService,
      rateLimiter: allowAllRateLimiter()
    });

    const inspectResponse = await handler({
      ...baseRequest,
      method: "GET",
      path: "/api/operator/tenants/tenant-session/jobs/job-1"
    });
    const deadLettersResponse = await handler({
      ...baseRequest,
      method: "GET",
      path: "/api/operator/tenants/tenant-session/jobs/dead-letters"
    });

    expect(inspectResponse).toMatchObject({
      status: 200,
      body: {
        job: {
          id: "job-1",
          tenantId: "tenant-session",
          status: "failed",
          attempts: 3
        }
      }
    });
    expect(JSON.stringify(inspectResponse.body)).not.toContain("payload");
    expect(JSON.stringify(inspectResponse.body)).not.toContain("rawError");
    expect(deadLettersResponse).toMatchObject({
      status: 200,
      body: { jobs: [{ id: "job-2", tenantId: "tenant-session", failedAt: "2026-06-29T00:00:00.000Z" }] }
    });
    expect(JSON.stringify(deadLettersResponse.body)).not.toContain("secret");
    expect(deps.audit).not.toHaveBeenCalledWith(expect.objectContaining({ eventType: "operator.job_inspected" }));
  });

  it("maps emergency and secret mutations to no-content responses without leaking handles", async () => {
    const deps = operatorDeps();
    const operatorService = createOperatorService(deps);
    const handler = createOperatorHttpHandler({
      allowedOrigins: ["https://portal.example.test"],
      authenticate: vi.fn().mockResolvedValue({ tenantId: "tenant-session", userId: "operator-1", role: "operator" }),
      operatorService,
      rateLimiter: allowAllRateLimiter()
    });

    const revokeResponse = await handler({
      ...baseRequest,
      method: "POST",
      path: "/api/operator/tenants/tenant-session/secrets/vault%3A%2F%2Fsecret-1/revoke",
      body: { reason: "compromised" }
    });
    const rotateResponse = await handler({
      ...baseRequest,
      method: "POST",
      path: "/api/operator/tenants/tenant-session/secrets/vault%3A%2F%2Fsecret-1/rotate",
      body: { reason: "scheduled rotation" }
    });
    const cancelRunsResponse = await handler({
      ...baseRequest,
      method: "POST",
      path: "/api/operator/tenants/tenant-session/runs/cancel-by-secret-ref",
      body: { secretRef: "vault://secret-1", reason: "compromised" }
    });
    const disableResponse = await handler({
      ...baseRequest,
      method: "POST",
      path: "/api/operator/tenants/tenant-session/emergency/disable-paperclip",
      body: { reason: "launch safety" }
    });

    expect(revokeResponse).toEqual(expect.objectContaining({ status: 204, body: null }));
    expect(rotateResponse).toEqual(expect.objectContaining({ status: 204, body: null }));
    expect(cancelRunsResponse).toEqual(expect.objectContaining({ status: 204, body: null }));
    expect(disableResponse).toEqual(expect.objectContaining({ status: 204, body: null }));
    expect(JSON.stringify([revokeResponse.body, rotateResponse.body, cancelRunsResponse.body, disableResponse.body])).not.toContain("vault://secret-1");
    expect(JSON.stringify([revokeResponse.body, rotateResponse.body, cancelRunsResponse.body, disableResponse.body])).not.toContain("run-");
    expect(deps.secrets.revoke).toHaveBeenCalledWith({
      tenantId: "tenant-session",
      actorUserId: "operator-1",
      secretRef: "vault://secret-1",
      reason: "compromised"
    });
    expect(deps.secrets.rotate).toHaveBeenCalledWith({
      tenantId: "tenant-session",
      actorUserId: "operator-1",
      secretRef: "vault://secret-1",
      reason: "scheduled rotation"
    });
    expect(deps.runs.cancelBySecretRef).toHaveBeenCalledWith({
      tenantId: "tenant-session",
      secretRef: "vault://secret-1"
    });
    expect(deps.tenantControls.disablePaperclip).toHaveBeenCalledWith({
      tenantId: "tenant-session",
      reason: "launch safety"
    });
  });
});

function operatorDeps(overrides: Partial<Parameters<typeof createOperatorService>[0]> = {}): Parameters<typeof createOperatorService>[0] {
  return {
    isOperator: vi.fn().mockResolvedValue(true),
    tenantControls: {
      pause: vi.fn().mockResolvedValue(undefined),
      resume: vi.fn().mockResolvedValue(undefined),
      disablePaperclip: vi.fn().mockResolvedValue(undefined),
      ...overrides.tenantControls
    },
    jobs: {
      inspect: vi.fn().mockResolvedValue({ id: "job-1", tenantId: "tenant-session", status: "failed" }),
      retry: vi.fn().mockResolvedValue(undefined),
      cancel: vi.fn().mockResolvedValue(undefined),
      deadLetters: vi.fn().mockResolvedValue([]),
      ...overrides.jobs
    },
    runs: {
      cancelBySecretRef: vi.fn().mockResolvedValue({ cancelled: 0, runIds: [] }),
      ...overrides.runs
    },
    secrets: {
      rotate: vi.fn().mockResolvedValue({ nextSecretRef: "vault://next" }),
      revoke: vi.fn().mockResolvedValue(undefined),
      ...overrides.secrets
    },
    audit: vi.fn().mockResolvedValue(undefined),
    ...overrides
  };
}

function allowAllRateLimiter() {
  return {
    consume: vi.fn().mockResolvedValue({ allowed: true, remaining: 99, resetAt: Date.now() + 60_000 })
  };
}
