import { describe, expect, it, vi } from "vitest";

import { createPostgresOperatorDependencies, OperatorOperationNotImplementedError } from "../src/operators/operator-deps.js";

describe("postgres operator dependencies", () => {
  it("checks the durable tenant role before operator service dispatch proceeds", async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ tenant_id: "tenant-1" }] })
      .mockResolvedValueOnce({ rows: [] });
    const deps = createPostgresOperatorDependencies({ query }, vi.fn());

    await expect(deps.isOperator({ tenantId: "tenant-1", actorUserId: "user-1" })).resolves.toBe(true);
    await expect(deps.isOperator({ tenantId: "tenant-1", actorUserId: "user-2" })).resolves.toBe(false);

    expect(String(query.mock.calls[0]?.[0])).toMatch(/from wfpc\.tenant_memberships/i);
    expect(String(query.mock.calls[0]?.[0])).toMatch(/role in \('owner', 'admin', 'operator'\)/i);
    expect(query.mock.calls[0]?.[1]).toEqual(["tenant-1", "user-1"]);
  });

  it("pauses and resumes a tenant through the existing tenants.paused_at reservation gate column", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const deps = createPostgresOperatorDependencies({ query }, vi.fn());

    await deps.tenantControls.pause({ tenantId: "tenant-1", reason: "incident" });
    await deps.tenantControls.resume({ tenantId: "tenant-1", reason: "clear" });

    expect(String(query.mock.calls[0]?.[0])).toMatch(/update wfpc\.tenants[\s\S]+set paused_at = now\(\)/i);
    expect(String(query.mock.calls[0]?.[0])).toMatch(/updated_at = now\(\)/i);
    expect(query.mock.calls[0]?.[1]).toEqual(["tenant-1"]);
    expect(String(query.mock.calls[1]?.[0])).toMatch(/update wfpc\.tenants[\s\S]+set paused_at = null/i);
    expect(String(query.mock.calls[1]?.[0])).toMatch(/updated_at = now\(\)/i);
    expect(query.mock.calls[1]?.[1]).toEqual(["tenant-1"]);
  });

  it("keeps job, secret, run-cancel, and Paperclip disable operations explicitly deferred", async () => {
    const deps = createPostgresOperatorDependencies({ query: vi.fn() }, vi.fn());

    await expect(deps.jobs.inspect({ tenantId: "tenant-1", jobId: "job-1" })).rejects.toBeInstanceOf(OperatorOperationNotImplementedError);
    await expect(deps.jobs.deadLetters({ tenantId: "tenant-1" })).rejects.toBeInstanceOf(OperatorOperationNotImplementedError);
    await expect(deps.runs.cancelBySecretRef({ tenantId: "tenant-1", secretRef: "vault://secret" })).rejects.toBeInstanceOf(OperatorOperationNotImplementedError);
    await expect(deps.secrets.rotate({
      tenantId: "tenant-1",
      actorUserId: "user-1",
      secretRef: "vault://secret",
      nextSecretValues: { apiKey: "sk-test" }
    })).rejects.toBeInstanceOf(OperatorOperationNotImplementedError);
    await expect(deps.secrets.revoke({ tenantId: "tenant-1", actorUserId: "user-1", secretRef: "vault://secret" })).rejects.toBeInstanceOf(OperatorOperationNotImplementedError);
    await expect(deps.tenantControls.disablePaperclip({ tenantId: "tenant-1", reason: "incident" })).rejects.toBeInstanceOf(OperatorOperationNotImplementedError);
  });
});
