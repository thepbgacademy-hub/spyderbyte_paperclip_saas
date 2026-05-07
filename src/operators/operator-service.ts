import { safeAuditMetadata } from "../secrets/redaction.js";

export class OperatorAccessError extends Error {
  readonly code = "operator_access_denied";
  readonly publicMessage = "workflow_failed";
}

type OperatorInput = { tenantId: string; actorUserId: string };
type Audit = (event: { tenantId: string; actorUserId: string; eventType: string; entityType: string; metadata: Record<string, unknown> }) => void | Promise<void>;

type Dependencies = {
  isOperator(input: OperatorInput): Promise<boolean>;
  tenantControls: {
    pause(input: { tenantId: string; reason: string }): Promise<void> | void;
    resume(input: { tenantId: string; reason?: string }): Promise<void> | void;
    disablePaperclip(input: { tenantId: string; reason: string }): Promise<void> | void;
  };
  jobs: {
    inspect(input: { tenantId: string; jobId: string }): Promise<Record<string, unknown>>;
    retry(input: { tenantId: string; jobId: string }): Promise<void> | void;
    cancel(input: { tenantId: string; jobId: string }): Promise<void> | void;
    deadLetters(input: { tenantId: string }): Promise<Record<string, unknown>[]>;
  };
  secrets: {
    rotate(input: { tenantId: string; actorUserId: string; secretRef: string; nextSecretValues: Record<string, string> }): Promise<unknown>;
    revoke(input: { tenantId: string; actorUserId: string; secretRef: string }): Promise<unknown>;
  };
  audit: Audit;
};

export function createOperatorService(deps: Dependencies) {
  async function requireOperator(input: OperatorInput): Promise<void> {
    if (!(await deps.isOperator(input))) throw new OperatorAccessError("Operator access denied");
  }

  async function audit(input: OperatorInput & { eventType: string; entityType: string; metadata?: Record<string, unknown> }) {
    await deps.audit({
      tenantId: input.tenantId,
      actorUserId: input.actorUserId,
      eventType: input.eventType,
      entityType: input.entityType,
      metadata: safeAuditMetadata(input.metadata ?? {})
    });
  }

  return {
    async pauseTenant(input: OperatorInput & { reason: string }) {
      await requireOperator(input);
      await deps.tenantControls.pause({ tenantId: input.tenantId, reason: input.reason });
      await audit({ ...input, eventType: "operator.tenant_paused", entityType: "tenant", metadata: { reason: input.reason } });
    },
    async resumeTenant(input: OperatorInput & { reason?: string }) {
      await requireOperator(input);
      await deps.tenantControls.resume({ tenantId: input.tenantId, ...(input.reason ? { reason: input.reason } : {}) });
      await audit({ ...input, eventType: "operator.tenant_resumed", entityType: "tenant", metadata: { reason: input.reason } });
    },
    async inspectJob(input: OperatorInput & { jobId: string }) {
      await requireOperator(input);
      return sanitize(await deps.jobs.inspect({ tenantId: input.tenantId, jobId: input.jobId }));
    },
    async retryJob(input: OperatorInput & { jobId: string }) {
      await requireOperator(input);
      await deps.jobs.retry({ tenantId: input.tenantId, jobId: input.jobId });
      await audit({ ...input, eventType: "operator.job_retried", entityType: "workflow_job" });
    },
    async cancelJob(input: OperatorInput & { jobId: string }) {
      await requireOperator(input);
      await deps.jobs.cancel({ tenantId: input.tenantId, jobId: input.jobId });
      await audit({ ...input, eventType: "operator.job_cancelled", entityType: "workflow_job" });
    },
    async listDeadLetters(input: OperatorInput) {
      await requireOperator(input);
      return (await deps.jobs.deadLetters({ tenantId: input.tenantId })).map(sanitize);
    },
    async rotateSecret(input: OperatorInput & { secretRef: string; nextSecretValues: Record<string, string> }) {
      await requireOperator(input);
      await deps.secrets.rotate(input);
      await audit({ ...input, eventType: "operator.secret_rotated", entityType: "secret_reference" });
    },
    async revokeSecret(input: OperatorInput & { secretRef: string }) {
      await requireOperator(input);
      await deps.secrets.revoke(input);
      await audit({ ...input, eventType: "operator.secret_revoked", entityType: "secret_reference" });
    },
    async disablePaperclip(input: OperatorInput & { reason: string }) {
      await requireOperator(input);
      await deps.tenantControls.disablePaperclip({ tenantId: input.tenantId, reason: input.reason });
      await audit({ ...input, eventType: "operator.paperclip_disabled", entityType: "tenant", metadata: { reason: input.reason } });
    }
  };
}

function sanitize(row: Record<string, unknown>): Record<string, unknown> {
  const safe: Record<string, unknown> = {};
  for (const key of ["id", "tenantId", "status", "attempts", "createdAt", "updatedAt", "failedAt"]) {
    if (key in row) safe[key] = row[key];
  }
  return safe;
}
