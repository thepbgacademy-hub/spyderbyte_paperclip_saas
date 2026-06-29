import { describe, expect, it, vi } from "vitest";

import { createOperatorService, OperatorAccessError } from "../src/operators/operator-service.js";

function service(overrides = {}) {
  const deps = {
    isOperator: vi.fn().mockResolvedValue(true),
    tenantControls: { pause: vi.fn(), resume: vi.fn(), disablePaperclip: vi.fn() },
    jobs: {
      inspect: vi.fn().mockResolvedValue({
        id: "job-1",
        tenantId: "tenant-1",
        rawLog: "hidden",
        status: "failed",
        data: { apiKey: "sk-secret", nested: { prompt: "hidden" } }
      }),
      retry: vi.fn(),
      cancel: vi.fn(),
      deadLetters: vi.fn().mockResolvedValue([{ id: "job-1", rawLog: "hidden", payload: { secretRef: "secret_ref" } }])
    },
    runs: {
      cancelBySecretRef: vi.fn().mockResolvedValue({ cancelled: 2, runIds: ["run-1", "run-2"] })
    },
    secrets: { rotate: vi.fn(), revoke: vi.fn() },
    audit: vi.fn(),
    ...overrides
  };
  return { deps, operator: createOperatorService(deps) };
}

describe("operator service", () => {
  it("fails closed when actor is not an operator", async () => {
    const { operator, deps } = service({ isOperator: vi.fn().mockResolvedValue(false) });
    await expect(operator.pauseTenant({ tenantId: "tenant-1", actorUserId: "user-1", reason: "risk" })).rejects.toBeInstanceOf(OperatorAccessError);
    expect(deps.tenantControls.pause).not.toHaveBeenCalled();
  });

  it("pauses tenants and writes audit events", async () => {
    const { operator, deps } = service();
    await operator.pauseTenant({ tenantId: "tenant-1", actorUserId: "admin-1", reason: "risk" });
    expect(deps.tenantControls.pause).toHaveBeenCalledWith({ tenantId: "tenant-1", reason: "risk" });
    expect(deps.audit).toHaveBeenCalledWith(expect.objectContaining({ eventType: "operator.tenant_paused", entityType: "tenant" }));
  });

  it("returns sanitized job inspection and dead-letter data", async () => {
    const { operator } = service();
    await expect(operator.inspectJob({ tenantId: "tenant-1", actorUserId: "admin-1", jobId: "job-1" })).resolves.toEqual({ id: "job-1", tenantId: "tenant-1", status: "failed" });
    await expect(operator.listDeadLetters({ tenantId: "tenant-1", actorUserId: "admin-1" })).resolves.toEqual([{ id: "job-1" }]);
  });

  it("delegates secret rotate/revoke and emergency Paperclip disable", async () => {
    const { operator, deps } = service();
    await operator.rotateSecret({ tenantId: "tenant-1", actorUserId: "admin-1", secretRef: "secret_ref", nextSecretValues: { apiKey: "sk-next" } });
    await operator.revokeSecret({ tenantId: "tenant-1", actorUserId: "admin-1", secretRef: "secret_ref" });
    await operator.disablePaperclip({ tenantId: "tenant-1", actorUserId: "admin-1", reason: "incident" });
    expect(deps.secrets.rotate).toHaveBeenCalled();
    expect(deps.secrets.revoke).toHaveBeenCalled();
    expect(deps.tenantControls.disablePaperclip).toHaveBeenCalledWith({ tenantId: "tenant-1", reason: "incident" });
    expect(JSON.stringify(deps.audit.mock.calls)).not.toContain("sk-next");
  });

  it("cancels stale active runs bound to one secret ref and audits without leaking the raw secret ref", async () => {
    const { operator, deps } = service();

    await expect(
      operator.cancelRunsBySecretRef({
        tenantId: "tenant-1",
        actorUserId: "admin-1",
        secretRef: "wf_secret_old"
      })
    ).resolves.toEqual({ cancelled: 2, runIds: ["run-1", "run-2"] });

    expect(deps.runs.cancelBySecretRef).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      secretRef: "wf_secret_old"
    });
    expect(deps.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "operator.bound_runs_cancelled",
        entityType: "workflow_run",
        metadata: expect.objectContaining({
          cancelled: 2,
          runIds: ["run-1", "run-2"]
        })
      })
    );
    expect(JSON.stringify(deps.audit.mock.calls)).not.toContain("wf_secret_old");
  });
});
