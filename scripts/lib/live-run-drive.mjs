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

export async function reserveLiveWorkflowRun(input) {
  const tenant = await input.client.query("select paused_at from wfpc.tenants where id = $1 for update", [input.tenantId]);
  if (tenant.rows.length === 0) {
    return { reserved: false, reason: "tenant_not_found" };
  }
  if (tenant.rows[0]?.paused_at !== null) {
    return { reserved: false, reason: "tenant_paused" };
  }

  const membership = await input.client.query("select tenant_id from wfpc.tenant_memberships where tenant_id = $1 and user_id = $2", [input.tenantId, input.userId]);
  if (membership.rows.length === 0) {
    return { reserved: false, reason: "not_member" };
  }

  const workflow = await input.client.query(
    "select id, package_id, provider_kind from wfpc.workflow_templates where tenant_id = $1 and id = $2 and enabled = true for update",
    [input.tenantId, input.workflowId]
  );
  if (workflow.rows.length === 0) {
    return { reserved: false, reason: "workflow_unavailable" };
  }

  const workflowRow = workflow.rows[0];
  if (!workflowRow.package_id) {
    return { reserved: false, reason: "entitlement_denied" };
  }

  const install = await input.client.query(
    `select i.id
     from wfpc.tenant_package_installs i
     join wfpc.tenant_package_purchases p
       on p.tenant_id = i.tenant_id
      and p.package_id = i.package_id
     where i.tenant_id = $1
       and i.package_id = $2
       and i.status = 'active'
       and p.status = 'active'
       and p.starts_at <= now()
       and (p.ends_at is null or p.ends_at > now())
     limit 1
     for update`,
    [input.tenantId, workflowRow.package_id]
  );
  if (install.rows.length === 0) {
    return { reserved: false, reason: "entitlement_denied" };
  }

  const requirement = await input.client.query(
    `select id, capability, provider_kind
     from wfpc.package_provider_requirements
     where package_id = $1
       and (provider_kind is null or provider_kind = $2)
     order by case when provider_kind = $2 then 0 else 1 end, capability`,
    [workflowRow.package_id, workflowRow.provider_kind]
  );
  if (requirement.rows.length === 0) {
    return { reserved: false, reason: "entitlement_denied" };
  }

  const credential = await input.client.query(
    "select id, secret_ref, label, metadata from wfpc.secret_references where tenant_id = $1 and provider_kind = $2 and revoked_at is null limit 1 for update",
    [input.tenantId, workflowRow.provider_kind]
  );
  if (credential.rows.length === 0) {
    return { reserved: false, reason: "credential_revoked" };
  }

  const credentialRow = credential.rows[0];
  const boundCapability = resolveBoundCapability({
    providerKind: String(workflowRow.provider_kind),
    requirementRows: requirement.rows
  });
  if (!boundCapability) {
    return { reserved: false, reason: "entitlement_denied" };
  }
  const reservation = await input.client.query(
    `insert into wfpc.workflow_run_reservations
      (tenant_id, workflow_template_id, run_id, idempotency_key, reserved_by_user_id)
     values ($1, $2, $3, $4, $5)
     on conflict do nothing
     returning id`,
    [input.tenantId, input.workflowId, input.runId, input.idempotencyKey, input.userId]
  );
  if (reservation.rows.length === 0) {
    return { reserved: false, reason: "duplicate" };
  }

  await input.client.query(
    `insert into wfpc.workflow_runs
      (id, tenant_id, workflow_template_id, created_by_user_id, status, bound_secret_reference_id, bound_provider_context)
     values ($1, $2, $3, $4, 'queued', $5::uuid, $6::jsonb)`,
    [
      input.runId,
      input.tenantId,
      input.workflowId,
      input.userId,
      String(credentialRow.id),
      JSON.stringify([
        {
          capability: boundCapability,
          providerKind: String(workflowRow.provider_kind),
          label: String(credentialRow.label),
          secretRef: String(credentialRow.secret_ref),
          metadata: credentialRow.metadata && typeof credentialRow.metadata === "object" ? credentialRow.metadata : {}
        }
      ])
    ]
  );

  await input.client.query(
    `insert into wfpc.workflow_queue_outbox
      (tenant_id, run_id, workflow_template_id, created_by_user_id, idempotency_key)
     values ($1, $2, $3, $4, $5)
     on conflict (tenant_id, run_id) do nothing`,
    [input.tenantId, input.runId, input.workflowId, input.userId, input.idempotencyKey]
  );

  return { reserved: true, runId: input.runId };
}

export async function loadWorkflowRunSnapshot({ client, tenantId, runId }) {
  const snapshotResult = await client.query(
    `select
        run.id as run_id,
        run.status as run_status,
        run.created_at as run_created_at,
        run.bound_secret_reference_id,
        run.bound_provider_context,
        outbox.id as outbox_id,
        outbox.status as outbox_status,
        outbox.created_at as outbox_created_at,
        outbox.attempts as outbox_attempts,
        outbox.last_error as outbox_last_error
     from wfpc.workflow_runs run
     left join wfpc.workflow_queue_outbox outbox
       on outbox.tenant_id = run.tenant_id
      and outbox.run_id = run.id
     where run.tenant_id = $1
       and run.id = $2
     limit 1`,
    [tenantId, runId]
  );

  const row = asRecord(snapshotResult.rows[0]);

  return {
    run: {
      id: String(row.run_id ?? ""),
      status: String(row.run_status ?? ""),
      createdAt: coerceTimestamp(row.run_created_at),
      boundSecretReferenceId: String(row.bound_secret_reference_id ?? ""),
      providerContext: toProviderContext(row.bound_provider_context)
    },
    outbox: {
      id: String(row.outbox_id ?? ""),
      status: String(row.outbox_status ?? ""),
      createdAt: coerceTimestamp(row.outbox_created_at),
      attempts: Number(row.outbox_attempts ?? 0),
      lastError: typeof row.outbox_last_error === "string" ? row.outbox_last_error : null
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

  if (!snapshot.run.boundSecretReferenceId || snapshot.run.providerContext.length !== 1) {
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

  if (snapshot.outbox.status === "enqueued" && queue.reachable === false) {
    return {
      ok: true,
      phase: "queued_queue_unreachable",
      notes: [
        "Workflow run is reserved and the outbox is marked enqueued.",
        "Queue reachability could not be verified from this caller.",
        `Queue inspection error: ${queue.error ?? "unknown"}`
      ]
    };
  }

  return {
    ok: false,
    phase: "verification_incomplete",
    notes: [
      "Workflow run verification did not reach a known ready state.",
      `Run status: ${snapshot.run.status || "missing"}. Outbox status: ${snapshot.outbox.status || "missing"}. Queue state: ${queue.state ?? "missing"}. Queue reachable: ${queue.reachable === false ? `no (${queue.error ?? "unknown"})` : "yes"}.`
    ]
  };
}

function asRecord(value) {
  return value && typeof value === "object" ? value : {};
}

function coerceTimestamp(value) {
  if (typeof value === "string" && value.trim().length > 0) {
    return value;
  }

  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return value.toISOString();
  }

  return null;
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

function resolveBoundCapability(input) {
  const normalizedCapabilities = [...new Set(input.requirementRows.map(asRecord).map((row) => normalizeProviderCapability(row.capability)).filter((value) => value !== null))];
  if (normalizedCapabilities.length === 1) {
    return normalizedCapabilities[0];
  }

  if (normalizedCapabilities.length > 1) {
    return null;
  }

  return inferCapabilityFromProviderKind(input.providerKind);
}

function normalizeProviderCapability(value) {
  if (value === "content_generation") {
    return "text_generation";
  }

  return value === "text_generation" ||
    value === "image_generation" ||
    value === "video_generation" ||
    value === "social_publishing" ||
    value === "media_storage"
    ? value
    : null;
}

function inferCapabilityFromProviderKind(providerKind) {
  return providerKind === "openai" ||
    providerKind === "openai_api" ||
    providerKind === "openai_chatgpt_codex_subscription" ||
    providerKind === "anthropic_api" ||
    providerKind === "xai_grok_api" ||
    providerKind === "openrouter_api" ||
    providerKind === "generic_api"
    ? "text_generation"
    : null;
}
