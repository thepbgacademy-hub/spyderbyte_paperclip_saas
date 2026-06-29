import { randomUUID } from "node:crypto";

export function createLiveRunRequest(input) {
  const runId = input.runId ?? randomUUID();
  return {
    tenantId: input.tenantId,
    userId: input.userId,
    workflowId: input.workflowId,
    ...(input.workflowTemplateId ? { workflowTemplateId: input.workflowTemplateId } : {}),
    ...(input.skipExistingHarnessReuse ? { skipExistingHarnessReuse: true } : {}),
    runId,
    idempotencyKey: `${input.tenantId}:${input.workflowId}:${runId}`
  };
}

export async function reserveLiveWorkflowRun(input) {
  const workflowTemplateId = await resolveWorkflowTemplateId({
    client: input.client,
    tenantId: input.tenantId,
    workflowTemplateId: input.workflowTemplateId,
    workflowId: input.workflowId
  });
  if (!workflowTemplateId) {
    return { reserved: false, reason: "workflow_template_required" };
  }
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
    [input.tenantId, workflowTemplateId]
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
  const bootstrapper = isUuid(input.workflowId) ? null : await loadNativePublicRunBootstrapper(input.bootstrapNativePublicRun);
  const supportsNativePublicHarnessBootstrap = Boolean(bootstrapper?.hasWorkflowBootstrap(input.workflowId));
  const existingHarnessRunId =
    supportsNativePublicHarnessBootstrap
      ? await findExistingNativePublicHarnessRunId({
          client: input.client,
          tenantId: input.tenantId,
          workflowId: input.workflowId
        })
      : null;
  if (input.skipExistingHarnessReuse && existingHarnessRunId) {
    return {
      reserved: false,
      reason: "fresh_harness_run_conflict",
      existingRunId: existingHarnessRunId
    };
  }
  const existingNativePublicRun =
    input.skipExistingHarnessReuse || !supportsNativePublicHarnessBootstrap || !existingHarnessRunId
      ? null
      : await reuseExistingNativePublicRunIfPresent({
        client: input.client,
        tenantId: input.tenantId,
        userId: input.userId,
        workflowId: input.workflowId,
        workflowTemplateId,
        workflowPackageId: String(workflowRow.package_id),
        providerKind: String(workflowRow.provider_kind),
        credentialRow,
        boundCapability,
        idempotencyKey: input.idempotencyKey,
        existingRunId: existingHarnessRunId
      });
  if (existingNativePublicRun) {
    return existingNativePublicRun;
  }
  const reservation = await input.client.query(
    `insert into wfpc.workflow_run_reservations
      (tenant_id, public_workflow_id, workflow_template_id, workflow_identity_kind, workflow_package_id, run_id, idempotency_key, reserved_by_user_id)
     values ($1, $2, $3, 'tenant_template', $4::uuid, $5, $6, $7)
     on conflict do nothing
     returning id`,
    [input.tenantId, input.workflowId, workflowTemplateId, workflowRow.package_id, input.runId, input.idempotencyKey, input.userId]
  );
  if (reservation.rows.length === 0) {
    return { reserved: false, reason: "duplicate" };
  }

  await input.client.query(
    `insert into wfpc.workflow_runs
      (id, tenant_id, public_workflow_id, workflow_template_id, workflow_identity_kind, workflow_package_id, created_by_user_id, status, bound_secret_reference_id, bound_provider_context)
     values ($1, $2, $3, $4, 'tenant_template', $5::uuid, $6, 'queued', $7::uuid, $8::jsonb)`,
    [
      input.runId,
      input.tenantId,
      input.workflowId,
      workflowTemplateId,
      workflowRow.package_id,
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
      (tenant_id, run_id, public_workflow_id, workflow_template_id, workflow_identity_kind, workflow_package_id, created_by_user_id, idempotency_key)
     values ($1, $2, $3, $4, 'tenant_template', $5::uuid, $6, $7)
     on conflict (tenant_id, run_id) do nothing`,
    [input.tenantId, input.runId, input.workflowId, workflowTemplateId, workflowRow.package_id, input.userId, input.idempotencyKey]
  );

  await bootstrapNativePublicRunIfNeeded({
    ...input,
    packageId: String(workflowRow.package_id),
    providerKind: String(workflowRow.provider_kind),
    credentialLabel: String(credentialRow.label),
    bootstrapper
  });

  return { reserved: true, runId: input.runId };
}

export async function loadWorkflowRunSnapshot({ client, tenantId, runId }) {
  const snapshotResult = await client.query(
    `select
        run.id as run_id,
        run.status as run_status,
        run.created_at as run_created_at,
        run.public_workflow_id,
        run.workflow_template_id,
        run.bound_secret_reference_id,
        run.bound_provider_context,
        secrets.secret_ref as current_secret_ref,
        outbox.id as outbox_id,
        outbox.status as outbox_status,
        outbox.created_at as outbox_created_at,
        outbox.public_workflow_id as outbox_public_workflow_id,
        outbox.workflow_template_id as outbox_workflow_template_id,
        outbox.attempts as outbox_attempts,
        outbox.last_error as outbox_last_error
     from wfpc.workflow_runs run
     left join wfpc.secret_references secrets
       on secrets.id = run.bound_secret_reference_id
      and secrets.tenant_id = run.tenant_id
      and secrets.revoked_at is null
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
      publicWorkflowId: String(row.public_workflow_id ?? ""),
      workflowTemplateId: typeof row.workflow_template_id === "string" ? row.workflow_template_id : "",
      boundSecretReferenceId: String(row.bound_secret_reference_id ?? ""),
      providerContext: toProviderContext(
        row.bound_provider_context,
        typeof row.current_secret_ref === "string" ? row.current_secret_ref : ""
      )
    },
    outbox: {
      id: String(row.outbox_id ?? ""),
      status: String(row.outbox_status ?? ""),
      createdAt: coerceTimestamp(row.outbox_created_at),
      publicWorkflowId: String(row.outbox_public_workflow_id ?? ""),
      workflowTemplateId: typeof row.outbox_workflow_template_id === "string" ? row.outbox_workflow_template_id : "",
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

  if (snapshot.outbox.status === "enqueued" && isWorkerPickupQueueState(queue.state)) {
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

  if (snapshot.outbox.status === "enqueued" && isTerminalQueueState(queue.state)) {
    return {
      ok: false,
      phase: "queue_terminal_state",
      notes: [
        "Workflow run is reserved and the outbox is marked enqueued.",
        "BullMQ reported a terminal queue state instead of a worker-pickup state.",
        `Queue state: ${queue.state}.`
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
      ok: false,
      phase: "queued_queue_unreachable",
      notes: [
        "Workflow run is reserved and the outbox is marked enqueued.",
        "Queue reachability could not be verified from this caller, so worker pickup is still unproven.",
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

function toProviderContext(value, currentSecretRef = "") {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map(asRecord)
    .map((entry) => ({
      capability: String(entry.capability ?? ""),
      providerKind: String(entry.providerKind ?? ""),
      label: String(entry.label ?? ""),
      secretRef: currentSecretRef,
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

async function bootstrapNativePublicRunIfNeeded(input) {
  if (isUuid(input.workflowId)) {
    return;
  }
  const bootstrapper = input.bootstrapper ?? await loadNativePublicRunBootstrapper(input.bootstrapNativePublicRun);
  if (!bootstrapper || !bootstrapper.hasWorkflowBootstrap(input.workflowId)) {
    return;
  }
  await bootstrapper.seedRun({
    client: input.client,
    tenantId: input.tenantId,
    runId: input.runId,
    workflowId: input.workflowId,
    packageId: input.packageId,
    providerKind: input.providerKind,
    credentialLabel: input.credentialLabel
  });
}

async function loadNativePublicRunBootstrapper(override) {
  if (override) {
    return {
      hasWorkflowBootstrap(workflowId) {
        return !isUuid(workflowId);
      },
      seedRun: override
    };
  }
  const [{ createPostgresHarnessRepository }, bootstrapModule] = await Promise.all([
    import("../../dist/harness/repository.js"),
    import("../../dist/harness/public-run-bootstrap.js")
  ]);
  if (typeof bootstrapModule.hasPublicWorkflowHarnessBootstrap !== "function" || typeof bootstrapModule.seedPublicWorkflowHarnessRun !== "function") {
    return null;
  }
  return {
    hasWorkflowBootstrap(workflowId) {
      return bootstrapModule.hasPublicWorkflowHarnessBootstrap(workflowId);
    },
    async seedRun(input) {
      await bootstrapModule.seedPublicWorkflowHarnessRun({
        repository: createPostgresHarnessRepository(input.client),
        tenantId: input.tenantId,
        runId: input.runId,
        workflowId: input.workflowId,
        packageId: input.packageId,
        providerKind: input.providerKind,
        credentialLabel: input.credentialLabel
      });
    }
  };
}

async function findExistingNativePublicHarnessRunId({ client, tenantId, workflowId }) {
  const existingHarnessRun = await client.query(
    `select id
     from wfpc.harness_runs
     where tenant_id = $1
       and workflow_id = $2
     order by updated_at desc, created_at desc
     limit 1`,
    [tenantId, workflowId]
  );
  const runId = String(existingHarnessRun.rows[0]?.id ?? "");
  return runId || null;
}

async function reuseExistingNativePublicRunIfPresent(input) {
  const runId = normalizeExistingRunId(input.existingRunId);
  if (!runId) {
    return null;
  }
  const reusedRunIdempotencyKey = `${input.tenantId}:${input.workflowId}:${runId}`;
  const workflowIdentityKind = input.workflowTemplateId ? "tenant_template" : "installed_package_overlay";

  await input.client.query(
    `insert into wfpc.workflow_runs
      (id, tenant_id, public_workflow_id, workflow_template_id, workflow_identity_kind, workflow_package_id, created_by_user_id, status, bound_secret_reference_id, bound_provider_context)
     values ($1, $2, $3, $4, $5, $6::uuid, $7, 'queued', $8::uuid, $9::jsonb)
     on conflict (id) do update
     set public_workflow_id = excluded.public_workflow_id,
         workflow_template_id = excluded.workflow_template_id,
         workflow_identity_kind = excluded.workflow_identity_kind,
         workflow_package_id = excluded.workflow_package_id,
         created_by_user_id = excluded.created_by_user_id,
         status = 'queued',
         bound_secret_reference_id = excluded.bound_secret_reference_id,
         bound_provider_context = excluded.bound_provider_context,
         updated_at = now()`,
    [
      runId,
      input.tenantId,
      input.workflowId,
      input.workflowTemplateId,
      workflowIdentityKind,
      input.workflowPackageId,
      input.userId,
      String(input.credentialRow.id),
      JSON.stringify([
        {
          capability: input.boundCapability,
          providerKind: input.providerKind,
          label: String(input.credentialRow.label),
          secretRef: String(input.credentialRow.secret_ref),
          metadata: input.credentialRow.metadata && typeof input.credentialRow.metadata === "object" ? input.credentialRow.metadata : {}
        }
      ])
    ]
  );

  await input.client.query(
    `insert into wfpc.workflow_queue_outbox
      (tenant_id, run_id, public_workflow_id, workflow_template_id, workflow_identity_kind, workflow_package_id, created_by_user_id, idempotency_key, status, available_at, claim_token, claimed_at, enqueued_at, last_error, updated_at)
     values ($1, $2, $3, $4, $5, $6::uuid, $7, $8, 'pending', now(), null, null, null, null, now())
     on conflict (tenant_id, run_id) do update
     set public_workflow_id = excluded.public_workflow_id,
         workflow_template_id = excluded.workflow_template_id,
         workflow_identity_kind = excluded.workflow_identity_kind,
         workflow_package_id = excluded.workflow_package_id,
         created_by_user_id = excluded.created_by_user_id,
         idempotency_key = case
           when wfpc.workflow_queue_outbox.status = 'claimed' then wfpc.workflow_queue_outbox.idempotency_key
           else excluded.idempotency_key
         end,
         status = case
           when wfpc.workflow_queue_outbox.status = 'claimed' then wfpc.workflow_queue_outbox.status
           else 'pending'
         end,
         available_at = case
           when wfpc.workflow_queue_outbox.status = 'claimed' then wfpc.workflow_queue_outbox.available_at
           else now()
         end,
         claim_token = case
           when wfpc.workflow_queue_outbox.status = 'claimed' then wfpc.workflow_queue_outbox.claim_token
           else null
         end,
         claimed_at = case
           when wfpc.workflow_queue_outbox.status = 'claimed' then wfpc.workflow_queue_outbox.claimed_at
           else null
         end,
         enqueued_at = case
           when wfpc.workflow_queue_outbox.status = 'claimed' then wfpc.workflow_queue_outbox.enqueued_at
           else null
         end,
         last_error = null,
         updated_at = now()`,
    [input.tenantId, runId, input.workflowId, input.workflowTemplateId, workflowIdentityKind, input.workflowPackageId, input.userId, reusedRunIdempotencyKey]
  );

  return { reserved: true, runId };
}

function normalizeExistingRunId(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

async function resolveWorkflowTemplateId({ client, tenantId, workflowTemplateId, workflowId }) {
  if (workflowTemplateId && isUuid(workflowTemplateId)) {
    return workflowTemplateId;
  }
  if (isUuid(workflowId)) {
    return workflowId;
  }
  return null;
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value ?? ""));
}

function isWorkerPickupQueueState(value) {
  return value === "waiting"
    || value === "active"
    || value === "prioritized"
    || value === "delayed"
    || value === "waiting-children"
    || value === "paused";
}

function isTerminalQueueState(value) {
  return value === "failed" || value === "completed";
}
