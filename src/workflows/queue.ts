export type WorkflowQueuePayload = {
  tenantId: string;
  runId: string;
  workflowId: string;
  createdByUserId: string;
  idempotencyKey: string;
  createdAt: string;
};

type CreateWorkflowQueuePayloadInput = {
  tenantId: string;
  runId: string;
  workflowId: string;
  createdByUserId: string;
  createdAt?: Date;
};

const ALLOWED_KEYS = new Set<keyof WorkflowQueuePayload>(["tenantId", "runId", "workflowId", "createdByUserId", "idempotencyKey", "createdAt"]);

export function createWorkflowQueuePayload(input: CreateWorkflowQueuePayloadInput): WorkflowQueuePayload {
  return validateWorkflowQueuePayload({
    tenantId: input.tenantId,
    runId: input.runId,
    workflowId: input.workflowId,
    createdByUserId: input.createdByUserId,
    idempotencyKey: `${input.tenantId}:${input.workflowId}:${input.runId}`,
    createdAt: (input.createdAt ?? new Date()).toISOString()
  });
}

export function validateWorkflowQueuePayload(value: unknown): WorkflowQueuePayload {
  if (!isRecord(value)) {
    throw new Error("Queue payload must be an object");
  }

  const forbiddenKeys = Object.keys(value).filter((key) => !ALLOWED_KEYS.has(key as keyof WorkflowQueuePayload));
  if (forbiddenKeys.length > 0) {
    throw new Error(`Queue payload contains forbidden keys: ${forbiddenKeys.join(", ")}`);
  }

  const payload = {
    tenantId: readRequiredString(value, "tenantId"),
    runId: readRequiredString(value, "runId"),
    workflowId: readRequiredString(value, "workflowId"),
    createdByUserId: readRequiredString(value, "createdByUserId"),
    idempotencyKey: readRequiredString(value, "idempotencyKey"),
    createdAt: readRequiredString(value, "createdAt")
  };

  assertSafeValue("tenantId", payload.tenantId);
  assertSafeValue("runId", payload.runId);
  assertSafeValue("workflowId", payload.workflowId);
  assertSafeValue("createdByUserId", payload.createdByUserId);

  if (payload.idempotencyKey !== `${payload.tenantId}:${payload.workflowId}:${payload.runId}`) {
    throw new Error("Queue payload idempotency key is invalid");
  }

  if (Number.isNaN(Date.parse(payload.createdAt))) {
    throw new Error("Queue payload createdAt must be an ISO date string");
  }

  return payload;
}

function readRequiredString(value: Record<string, unknown>, key: keyof WorkflowQueuePayload): string {
  const field = value[key];
  if (typeof field !== "string" || field.trim().length === 0) {
    throw new Error(`Queue payload ${key} is required`);
  }

  return field;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function assertSafeValue(key: keyof WorkflowQueuePayload, value: string): void {
  if (/^pc-(company|run|agent|goal|task)-/i.test(value)) {
    throw new Error(`Queue payload ${key} contains a forbidden internal value`);
  }

  if (/sk-[a-z0-9_-]+|api[_-]?key|token|secret|authorization|password|credential|prompt/i.test(value)) {
    throw new Error(`Queue payload ${key} contains a forbidden secret-like value`);
  }
}
