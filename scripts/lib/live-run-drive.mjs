import { randomUUID } from "node:crypto";

export function createLiveRunRequest(input) {
  const runId = input.runId ?? randomUUID();
  return {
    tenantId: input.tenantId,
    userId: input.userId,
    workflowId: input.workflowId,
    runId,
    idempotencyKey: `${input.tenantId}:${input.workflowId}:${runId}`
  };
}

export async function loadWorkflowRunSnapshot({ client, tenantId, runId }) {
  const [runResult, outboxResult] = await Promise.all([
    client.query(
      `select id, status, bound_secret_reference_id, bound_provider_context
       from wfpc.workflow_runs
       where tenant_id = $1 and id = $2
       limit 1`,
      [tenantId, runId]
    ),
    client.query(
      `select id, status, attempts, last_error
       from wfpc.workflow_queue_outbox
       where tenant_id = $1 and run_id = $2
       limit 1`,
      [tenantId, runId]
    )
  ]);

  const runRow = asRecord(runResult.rows[0]);
  const outboxRow = asRecord(outboxResult.rows[0]);

  return {
    run: {
      id: String(runRow.id ?? ""),
      status: String(runRow.status ?? ""),
      boundSecretReferenceId: String(runRow.bound_secret_reference_id ?? ""),
      providerContext: toProviderContext(runRow.bound_provider_context)
    },
    outbox: {
      id: String(outboxRow.id ?? ""),
      status: String(outboxRow.status ?? ""),
      attempts: Number(outboxRow.attempts ?? 0),
      lastError: typeof outboxRow.last_error === "string" ? outboxRow.last_error : null
    }
  };
}

export function summarizeWorkflowRunVerification({ snapshot, queue }) {
  if (snapshot.outbox.status === "failed") {
    return {
      ok: false,
      phase: "outbox_failed",
      notes: [
        "Workflow run is reserved but the outbox is failing to enqueue.",
        `Last outbox error: ${snapshot.outbox.lastError ?? "unknown"}`
      ]
    };
  }

  if (!snapshot.run.boundSecretReferenceId || snapshot.run.providerContext.length === 0) {
    return {
      ok: false,
      phase: "binding_missing",
      notes: [
        "Workflow run is missing bound provider context.",
        "The worker should not be allowed to drift onto an unbound or shared credential."
      ]
    };
  }

  if (snapshot.outbox.status === "enqueued" && queue.state) {
    return {
      ok: true,
      phase: "queued_for_worker",
      notes: [
        "Workflow run is reserved and queued.",
        "Bound provider context is attached to the workflow run.",
        "BullMQ job is present for worker pickup."
      ]
    };
  }

  if (snapshot.run.status === "queued" && snapshot.outbox.status === "pending") {
    return {
      ok: true,
      phase: "reserved_waiting_for_outbox",
      notes: [
        "Workflow run is reserved successfully.",
        "The outbox pump has not enqueued the job yet."
      ]
    };
  }

  return {
    ok: false,
    phase: "verification_incomplete",
    notes: [
      "Workflow run verification did not reach a known ready state.",
      `Run status: ${snapshot.run.status || "missing"}. Outbox status: ${snapshot.outbox.status || "missing"}. Queue state: ${queue.state ?? "missing"}.`
    ]
  };
}

function asRecord(value) {
  return value && typeof value === "object" ? value : {};
}

function toProviderContext(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map(asRecord)
    .map((entry) => ({
      capability: String(entry.capability ?? ""),
      providerKind: String(entry.providerKind ?? ""),
      label: String(entry.label ?? ""),
      secretRef: String(entry.secretRef ?? ""),
      metadata: asRecord(entry.metadata)
    }))
    .filter((entry) => entry.capability && entry.providerKind && entry.label && entry.secretRef);
}
