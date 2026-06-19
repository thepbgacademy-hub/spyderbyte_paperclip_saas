import { loadWorkflowRunSnapshot } from "./live-run-drive.mjs";

export async function postDashboardRunAndVerifyDurableBinding(input) {
  const fetchImpl = input.fetchImpl ?? fetch;
  const loadSnapshot = input.loadSnapshot ?? ((snapshotInput) => loadWorkflowRunSnapshot({
    client: input.client,
    tenantId: snapshotInput.tenantId,
    runId: snapshotInput.runId
  }));
  const sleepImpl = input.sleepImpl ?? sleep;
  const retryDelayMs = Number.isFinite(input.retryDelayMs) ? Math.max(0, input.retryDelayMs) : 50;
  const sessionCookieName = normalizeValue(input.sessionCookieName) ?? "wf_portal_session";
  const response = await fetchImpl(`${normalizeOrigin(input.baseUrl)}/api/dashboard/runs`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: normalizeOrigin(input.portalOrigin),
      cookie: `${sessionCookieName}=${input.sessionToken}`
    },
    body: JSON.stringify({
      workflowId: input.workflowId
    })
  });

  const body = await readJson(response);
  const runId = response.status === 202 && typeof body?.runId === "string" ? body.runId.trim() : "";
  if (!runId) {
    return {
      ok: false,
      error: {
        status: response.status,
        body
      }
    };
  }

  let snapshot = await loadSnapshot({
    tenantId: input.tenantId,
    runId
  });
  let verification = verifyDurableBinding(snapshot, input.workflowId);
  if (!verification.ok && verification.phase === "durable_rows_missing") {
    await sleepImpl(retryDelayMs);
    snapshot = await loadSnapshot({
      tenantId: input.tenantId,
      runId
    });
    verification = verifyDurableBinding(snapshot, input.workflowId);
  }

  return {
    ok: verification.ok,
    runId,
    snapshot,
    verification
  };
}

function verifyDurableBinding(snapshot, requestedWorkflowId) {
  if (!snapshot.run.id || !snapshot.outbox.id) {
    return {
      ok: false,
      phase: "durable_rows_missing",
      notes: [
        "Dashboard run request returned HTTP 202 but the durable workflow rows are incomplete.",
        "Expected both workflow run and queue outbox rows to exist for the returned run id."
      ]
    };
  }

  if (!matchesRequestedWorkflow(snapshot, requestedWorkflowId)) {
    return {
      ok: false,
      phase: "workflow_identity_mismatch",
      notes: [
        "Dashboard run request returned HTTP 202 but the durable workflow identity does not match the requested selector.",
        "Expected the workflow run or queue outbox identity to match the requested dashboard workflow id."
      ]
    };
  }

  if (snapshot.outbox.status === "failed") {
    return {
      ok: false,
      phase: "outbox_failed",
      notes: [
        "Dashboard run request returned HTTP 202 but the durable outbox is already failed.",
        `Last outbox error: ${snapshot.outbox.lastError ?? "unknown"}`
      ]
    };
  }

  if (!isAcceptedOutboxStatus(snapshot.outbox.status)) {
    return {
      ok: false,
      phase: "outbox_unexpected",
      notes: [
        "Dashboard run request returned HTTP 202 but the durable outbox state is not yet in an accepted launch posture.",
        `Observed outbox status: ${snapshot.outbox.status || "missing"}.`
      ]
    };
  }

  if (!snapshot.run.boundSecretReferenceId || snapshot.run.providerContext.length !== 1) {
    return {
      ok: false,
      phase: "binding_missing",
      notes: [
        "Dashboard run request returned HTTP 202 but the durable provider binding is incomplete.",
        "Expected one bound provider context entry and a bound secret reference on the workflow run."
      ]
    };
  }

  return {
    ok: true,
    phase: "durable_binding_verified",
    notes: [
      "Dashboard run request returned HTTP 202 with a durable run id.",
      "Workflow run and queue outbox rows are present with a single bound provider context."
    ]
  };
}

function normalizeOrigin(value) {
  const normalized = normalizeValue(value);
  if (!normalized) {
    throw new Error("Expected an HTTP origin");
  }
  return normalized.replace(/\/$/, "");
}

function normalizeValue(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function matchesRequestedWorkflow(snapshot, requestedWorkflowId) {
  const normalizedRequestedWorkflowId = normalizeValue(requestedWorkflowId);
  if (!normalizedRequestedWorkflowId) {
    return false;
  }

  const runIds = [snapshot?.run?.publicWorkflowId, snapshot?.run?.workflowTemplateId]
    .map(normalizeValue)
    .filter((value) => value !== null);
  const outboxIds = [snapshot?.outbox?.publicWorkflowId, snapshot?.outbox?.workflowTemplateId]
    .map(normalizeValue)
    .filter((value) => value !== null);

  return runIds.includes(normalizedRequestedWorkflowId) && outboxIds.includes(normalizedRequestedWorkflowId);
}

function isAcceptedOutboxStatus(value) {
  return value === "pending" || value === "claimed" || value === "enqueued";
}
