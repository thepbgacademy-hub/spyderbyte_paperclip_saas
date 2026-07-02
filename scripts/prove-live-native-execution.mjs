import { spawn, spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import process from "node:process";

import { verifyWaitingRoundTrip } from "./lib/live-attention-roundtrip-verification.mjs";
import { postDashboardRunAndVerifyDurableBinding } from "./lib/live-dashboard-run-proof.mjs";
import { resolveLiveNativeAttention } from "./lib/live-harness-board-roundtrip.mjs";
import { waitForNativeExecutionAcceptance } from "./lib/live-native-execution-acceptance.mjs";
import { buildNativeExecutionAcceptanceOptions } from "./lib/live-native-execution-proof-options.mjs";
import { resolveNativeProofStartSelector } from "./lib/native-proof-lane-model.mjs";
import { validateCodexReadinessProofGate } from "./lib/codex-readiness-proof-gate.mjs";
import { DEFAULT_STAGE_PROOF_ENV_FILE, DEFAULT_STAGE_SSH_ENV_FILE, parseStageProofArgs, resolveNodeCommand } from "./lib/stage-live-proof.mjs";
import { loadScriptEnv } from "./lib/script-env.mjs";

const CODEX_SUBSCRIPTION_WORKFLOW_IDS = new Set(["wf_connect_first_workflow"]);

const args = parseStageProofArgs(process.argv.slice(2));
const seedEnvFilePath = normalizeValue(args["env-file"] ?? process.env.WF_STAGE_ENV_FILE) ?? DEFAULT_STAGE_PROOF_ENV_FILE;
const sshEnvFilePath = normalizeValue(args["ssh-env-file"] ?? process.env.WF_STAGE_SSH_ENV_FILE) ?? DEFAULT_STAGE_SSH_ENV_FILE;
const source = {
  ...loadScriptEnv(sshEnvFilePath),
  ...loadScriptEnv(seedEnvFilePath)
};
const env = {
  ...process.env,
  ...source
};

const tenantId = requireArg(args, "tenant");
const userId = requireArg(args, "user");
const workflowId = requireArg(args, "workflow");
const codexReadinessGate = resolveCodexReadinessGate({
  workflowId,
  apiCodexHomeReadinessProofPath: args["api-codex-home-readiness-proof"],
  workerCodexHomeReadinessProofPath: args["worker-codex-home-readiness-proof"],
  expectedTenantId: tenantId,
  expectedWorkflowId: workflowId,
  expectedAuthStateRef: args["codex-auth-state-ref"] ?? env.WF_OPENAI_CODEX_AUTH_STATE_REF
});
if (!codexReadinessGate.ok) {
  process.exitCode = 1;
  process.stdout.write(
    JSON.stringify(
      {
        ok: false,
        phase: codexReadinessGate.phase,
        codexReadinessGate
      },
      null,
      2
    ) + "\n"
  );
  process.exit();
}
const workflowTemplateOverride = normalizeValue(args["workflow-template"] ?? env.WF_STAGE_WORKFLOW_TEMPLATE_ID);
const role = parseRole(args.role ?? env.WF_STAGE_PROOF_ROLE);
const expiresInMinutes = parseExpiresInMinutes(args["expires-in-minutes"] ?? env.WF_STAGE_PROOF_TOKEN_TTL_MINUTES);
const timeoutMs = parsePositiveInteger(args["timeout-ms"] ?? "15000", "timeout-ms");
const sessionCookieName = normalizeValue(args["session-cookie-name"] ?? env.WF_PORTAL_SESSION_COOKIE_NAME) ?? "wf_portal_session";
const expectedExecutionEngine =
  normalizeValue(args["expected-execution-engine"] ?? env.WF_STAGE_EXPECTED_EXECUTION_ENGINE) ?? "wf_native_v1";
const requireFreshRun = args["fresh-run"] === "true";
const providedSessionToken =
  normalizeValue(args["session-token"]) ??
  normalizeValue(env.WF_LIVE_SESSION_COOKIE_VALUE) ??
  normalizeValue(env.WF_SMOKE_SESSION_COOKIE_VALUE);
const remoteVerification = buildRemoteVerificationConfig({ args, env });
const startSelection = resolveNativeProofStartSelector({
  workflowId,
  workflowTemplateId: workflowTemplateOverride
});
const { resolvedStartWorkflowId, startPath } = startSelection;
const shouldProveAttentionRoundTrip = workflowId === "wf_connect_first_workflow" || workflowId === "wf_tax_strategy";
const browserProofBaseUrl =
  startPath === "dashboard_public_start" || shouldProveAttentionRoundTrip
    ? requireOrigin(args["base-url"] ?? env.WF_LIVE_BASE_URL ?? env.WF_STAGE_API_ORIGIN, "WF_LIVE_BASE_URL")
    : null;
const browserProofPortalOrigin =
  startPath === "dashboard_public_start" || shouldProveAttentionRoundTrip
    ? requireOrigin(args["portal-origin"] ?? env.WF_SMOKE_PORTAL_URL ?? env.WF_STAGE_PORTAL_ORIGIN, "WF_SMOKE_PORTAL_URL")
    : null;

const sessionTokenResolution =
  startPath === "dashboard_public_start" || shouldProveAttentionRoundTrip
    ? await resolveSessionToken({
        providedSessionToken,
        tenantId,
        userId,
        role,
        expiresInMinutes,
        env
      })
    : {
        source: "not_used",
        sessionToken: null
      };

const durableResult =
  startPath === "dashboard_public_start"
    ? await postDashboardRunAndVerifyDurableBinding({
        baseUrl: browserProofBaseUrl,
        portalOrigin: browserProofPortalOrigin,
        sessionCookieName,
        sessionToken: sessionTokenResolution.sessionToken,
        tenantId,
        workflowId: resolvedStartWorkflowId,
        loadSnapshot: ({ tenantId: snapshotTenantId, runId }) =>
          loadRemoteWorkflowRunSnapshot({
            sshTarget: remoteVerification.sshTarget,
            sudoPassword: remoteVerification.sudoPassword,
            containerName: remoteVerification.containerName,
            tenantId: snapshotTenantId,
            runId
          }),
        fetchImpl: (url, options) => fetchWithTimeout(url, options, timeoutMs)
      })
    : await reserveDirectNativePublicRun({
        sshTarget: remoteVerification.sshTarget,
        sudoPassword: remoteVerification.sudoPassword,
        containerName: remoteVerification.containerName,
        tenantId,
        userId,
        workflowId,
        workflowTemplateId: resolvedStartWorkflowId,
        requireFreshRun
      });

const nativeAcceptance =
  durableResult.runId
    ? await loadRemoteNativeAcceptance({
        sshTarget: remoteVerification.sshTarget,
        sudoPassword: remoteVerification.sudoPassword,
        containerName: remoteVerification.containerName,
        tenantId,
        runId: durableResult.runId
      })
    : null;
const advancementProof =
  durableResult.runId
    ? await advanceNativeExecutionProof({
        sshTarget: remoteVerification.sshTarget,
        sudoPassword: remoteVerification.sudoPassword,
        containerName: remoteVerification.containerName,
        tenantId,
        runId: durableResult.runId,
        workflowId,
        postAttemptedAt:
          durableResult.postAttemptedAt
          ?? durableResult.snapshot?.run?.createdAt
          ?? null,
        timeoutMs
      })
    : null;
const nativeVerification = verifyNativeAcceptance({
  durableResult,
  nativeAcceptance,
  advancementProof,
  expectedExecutionEngine
});
const waitingAttentionResolution =
  shouldProveAttentionRoundTrip &&
  durableResult.runId &&
  nativeVerification.ok &&
  (advancementProof?.phase === "native_waiting_reached" || advancementProof?.phase === "native_blocked_reached")
    ? await (async () => {
        return await resolveLiveNativeAttention({
          baseUrl: browserProofBaseUrl,
          portalOrigin: browserProofPortalOrigin,
          sessionCookieName,
          sessionToken: sessionTokenResolution.sessionToken,
          workflowId,
          expectedRunId: durableResult.runId,
          resumeSummary: resolveAttentionResumeSummary({ workflowId, phase: advancementProof?.phase }),
          taxStrategyPrerequisiteEvidence: resolveAttentionTaxStrategyEvidence({ workflowId, phase: advancementProof?.phase }),
          fetchImpl: (url, options) => fetchWithTimeout(url, options, timeoutMs)
        });
      })()
    : null;
const roundTripProof =
  waitingAttentionResolution?.ok && durableResult.runId
    ? await advanceNativeExecutionProof({
        sshTarget: remoteVerification.sshTarget,
        sudoPassword: remoteVerification.sudoPassword,
        containerName: remoteVerification.containerName,
        tenantId,
        runId: durableResult.runId,
        workflowId,
        postAttemptedAt: waitingAttentionResolution.postAttemptedAt,
        timeoutMs
      })
    : null;
const roundTripVerification = verifyWaitingRoundTrip({
  workflowId,
  nativeVerification,
  advancementProof,
  waitingAttentionResolution,
  roundTripProof
});
const ok = durableResult.ok && nativeVerification.ok && roundTripVerification.ok;

process.exitCode = ok ? 0 : 1;
process.stdout.write(
  JSON.stringify(
    {
      ok,
      request: {
        tenantId,
        userId,
        role,
        workflowId,
        resolvedStartWorkflowId,
        resolvedWorkflowTemplateId: startPath === "direct_public_reservation" ? resolvedStartWorkflowId : null
      },
      proof: {
        startPath,
        apiOrigin: browserProofBaseUrl,
        portalOrigin: browserProofPortalOrigin,
        codexReadinessGate,
        sessionCookieName,
        sessionTokenSource: sessionTokenResolution.source,
        expectedExecutionEngine,
        timeoutMs,
        envFilePath: seedEnvFilePath,
        sshEnvFilePath,
        remoteVerification: {
          sshTarget: remoteVerification.sshTarget,
          containerName: remoteVerification.containerName
        }
      },
      result: {
        durableResult,
        nativeAcceptance,
        advancementProof,
        nativeVerification,
        waitingAttentionResolution,
        roundTripProof,
        roundTripVerification
      }
    },
    null,
    2
  ) + "\n"
);

async function resolveSessionToken({ providedSessionToken, tenantId, userId, role, expiresInMinutes, env }) {
  if (providedSessionToken) {
    return {
      source: "provided",
      sessionToken: providedSessionToken
    };
  }

  runCommand("npm run build:server", resolveNodeCommand("npm"), ["run", "build:server"], { env });
  const { createRuntimeSessionToken, loadRuntimeSessionAuthEnv } = await import("../dist/api/runtime-auth.js");
  const runtimeAuthEnv = loadRuntimeSessionAuthEnv(env);
  return {
    source: "generated",
    sessionToken: createRuntimeSessionToken({
      signingKey: runtimeAuthEnv.signingKey,
      issuer: runtimeAuthEnv.issuer,
      audience: runtimeAuthEnv.audience,
      session: {
        tenantId,
        userId,
        role
      },
      expiresAt: new Date(Date.now() + expiresInMinutes * 60_000)
    })
  };
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error(`Native execution proof timed out after ${timeoutMs}ms`)), timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }
}

function buildRemoteVerificationConfig({ args, env }) {
  const sshTarget = normalizeValue(args["ssh-target"] ?? env.WF_STAGE_SSH_TARGET) ?? buildDefaultSshTarget(env);
  const sudoPassword = normalizeValue(env.VPS2_SUDO_PASSWORD);
  const containerName = normalizeValue(args["preflight-container"] ?? env.WF_STAGE_PREFLIGHT_CONTAINER) ?? "wf-stage-api";
  if (!sshTarget) {
    throw new Error("WF_STAGE_SSH_TARGET or VPS2_USER/VPS2_HOST is required for remote native verification");
  }
  if (!sudoPassword) {
    throw new Error("VPS2_SUDO_PASSWORD is required for remote native verification");
  }

  return {
    sshTarget,
    sudoPassword,
    containerName
  };
}

async function loadRemoteWorkflowRunSnapshot({ sshTarget, sudoPassword, containerName, tenantId, runId }) {
  const result = await runRemotePgQuery({
    sshTarget,
    sudoPassword,
    containerName,
    sql: [
      "select",
      "  run.id as run_id,",
      "  run.status as run_status,",
      "  run.created_at as run_created_at,",
      "  run.public_workflow_id,",
      "  run.workflow_template_id,",
      "  run.workflow_identity_kind,",
      "  run.workflow_definition_snapshot,",
      "  run.bound_secret_reference_id,",
      "  run.bound_provider_context,",
      "  secrets.secret_ref as current_secret_ref,",
      "  outbox.id as outbox_id,",
      "  outbox.status as outbox_status,",
      "  outbox.created_at as outbox_created_at,",
      "  outbox.public_workflow_id as outbox_public_workflow_id,",
      "  outbox.workflow_template_id as outbox_workflow_template_id,",
      "  outbox.workflow_identity_kind as outbox_workflow_identity_kind,",
      "  outbox.attempts as outbox_attempts,",
      "  outbox.last_error as outbox_last_error",
      "from wfpc.workflow_runs run",
      "left join wfpc.secret_references secrets",
      "  on secrets.id = run.bound_secret_reference_id",
      " and secrets.tenant_id = run.tenant_id",
      " and secrets.revoked_at is null",
      "left join wfpc.workflow_queue_outbox outbox",
      "  on outbox.tenant_id = run.tenant_id",
      " and outbox.run_id = run.id",
      "where run.tenant_id = $1",
      "  and run.id = $2",
      "limit 1"
    ].join(" "),
    params: [tenantId, runId]
  });
  const row = asRecord(result);
  return {
    run: {
      id: typeof row.run_id === "string" ? row.run_id : "",
      status: typeof row.run_status === "string" ? row.run_status : "",
      createdAt: toIsoString(row.run_created_at),
      publicWorkflowId: typeof row.public_workflow_id === "string" ? row.public_workflow_id : "",
      workflowTemplateId: typeof row.workflow_template_id === "string" ? row.workflow_template_id : "",
      workflowIdentityKind: typeof row.workflow_identity_kind === "string" ? row.workflow_identity_kind : "",
      workflowDefinitionSnapshot:
        row.workflow_definition_snapshot && typeof row.workflow_definition_snapshot === "object" && !Array.isArray(row.workflow_definition_snapshot)
          ? row.workflow_definition_snapshot
          : null,
      boundSecretReferenceId: typeof row.bound_secret_reference_id === "string" ? row.bound_secret_reference_id : "",
      providerContext: Array.isArray(row.bound_provider_context)
        ? row.bound_provider_context
            .filter((entry) => entry && typeof entry === "object")
            .map((entry) => ({
              capability: typeof entry.capability === "string" ? entry.capability : "",
              providerKind: typeof entry.providerKind === "string" ? entry.providerKind : "",
              label: typeof entry.label === "string" ? entry.label : "",
              secretRef: typeof row.current_secret_ref === "string" ? row.current_secret_ref : "",
              metadata: entry.metadata && typeof entry.metadata === "object" ? entry.metadata : {}
            }))
            .filter((entry) => entry.capability && entry.providerKind && entry.label && entry.secretRef)
        : []
    },
    outbox: {
      id: typeof row.outbox_id === "string" ? row.outbox_id : "",
      status: typeof row.outbox_status === "string" ? row.outbox_status : "",
      createdAt: toIsoString(row.outbox_created_at),
      publicWorkflowId: typeof row.outbox_public_workflow_id === "string" ? row.outbox_public_workflow_id : "",
      workflowTemplateId: typeof row.outbox_workflow_template_id === "string" ? row.outbox_workflow_template_id : "",
      workflowIdentityKind: typeof row.outbox_workflow_identity_kind === "string" ? row.outbox_workflow_identity_kind : "",
      attempts: Number(row.outbox_attempts ?? 0),
      lastError: typeof row.outbox_last_error === "string" ? row.outbox_last_error : null
    }
  };
}

async function loadRemoteNativeAcceptance({ sshTarget, sudoPassword, containerName, tenantId, runId }) {
  const result = await runRemotePgQuery({
    sshTarget,
    sudoPassword,
    containerName,
    sql: [
      "select",
      "  run.id as run_id,",
      "  run.status as run_status,",
      "  run.workflow_package_id,",
      "  run.workflow_template_id,",
      "  run.workflow_identity_kind,",
      "  run.workflow_definition_snapshot",
      "from wfpc.workflow_runs run",
      "where run.tenant_id = $1",
      "  and run.id = $2",
      "limit 1"
    ].join(" "),
    params: [tenantId, runId]
  });
  const row = asRecord(result);
  const workflowDefinitionSnapshot =
    row.workflow_definition_snapshot && typeof row.workflow_definition_snapshot === "object" && !Array.isArray(row.workflow_definition_snapshot)
      ? row.workflow_definition_snapshot
      : null;
  const executionEngine =
    workflowDefinitionSnapshot && typeof workflowDefinitionSnapshot.executionEngine === "string"
      ? workflowDefinitionSnapshot.executionEngine
      : "";

  return {
    runId: typeof row.run_id === "string" ? row.run_id : "",
    runStatus: typeof row.run_status === "string" ? row.run_status : "",
    workflowPackageId: typeof row.workflow_package_id === "string" ? row.workflow_package_id : null,
    workflowTemplateId: typeof row.workflow_template_id === "string" ? row.workflow_template_id : null,
    workflowIdentityKind: typeof row.workflow_identity_kind === "string" ? row.workflow_identity_kind : null,
    workflowDefinitionSnapshot,
    executionEngine
  };
}

async function reserveDirectNativePublicRun({ sshTarget, sudoPassword, containerName, tenantId, userId, workflowId, workflowTemplateId, requireFreshRun }) {
  process.stdout.write("\n>> remote direct public reservation via wf-stage-api\n");
  const preparedHarnessRun = await seedRemoteFreshHarnessRun({
    sshTarget,
    sudoPassword,
    containerName,
    tenantId,
    workflowId,
    workflowTemplateId,
    runId: randomUUID(),
    requireFreshRun
  });
  if (preparedHarnessRun?.ok === false) {
    return {
      ok: false,
      error: {
        code: normalizeValue(preparedHarnessRun.phase) ?? "direct_public_harness_precondition_failed",
        ...(normalizeValue(preparedHarnessRun.existingRunId) ? { existingRunId: normalizeValue(preparedHarnessRun.existingRunId) } : {}),
        ...(normalizeValue(preparedHarnessRun.mode) ? { harnessPreparationMode: normalizeValue(preparedHarnessRun.mode) } : {})
      }
    };
  }
  const requestedRunId = normalizeValue(preparedHarnessRun?.runId);
  if (!requestedRunId) {
    throw new Error("Remote harness bootstrap did not return a run id");
  }
  const reservation = await driveRemoteDirectNativeProofProductPath({
    sshTarget,
    sudoPassword,
    containerName,
    tenantId,
    userId,
    workflowId,
    workflowTemplateId,
    runId: requestedRunId,
    harnessPreparationMode: normalizeValue(preparedHarnessRun?.mode) ?? "unknown"
  });
  if (!reservation.ok) {
    return {
      ok: false,
      error: reservation.error ?? { code: "direct_public_product_path_failed" }
    };
  }

  const snapshot = await loadRemoteWorkflowRunSnapshot({
    sshTarget,
    sudoPassword,
    containerName,
    tenantId,
    runId: requestedRunId
  });
  const verification = verifyDirectNativeReservation({
    snapshot,
    workflowId,
    workflowIdentityKind: reservation.workflowIdentityKind,
    workflowTemplateId: reservation.workflowTemplateId,
    workflowPackageId: reservation.workflowPackageId,
    providerKind: reservation.providerKind
  });

  return {
    ok: verification.ok,
    runId: requestedRunId,
    postAttemptedAt: reservation.attemptedAt,
    snapshot,
    verification
  };
}

async function driveRemoteDirectNativeProofProductPath({
  sshTarget,
  sudoPassword,
  containerName,
  tenantId,
  userId,
  workflowId,
  workflowTemplateId,
  runId,
  harnessPreparationMode
}) {
  process.stdout.write("\n>> remote direct proof product path via wf-stage-api\n");
  const workflowIdentityKind = "tenant_template";
  const redispatchIdempotencyKey = createProofRedispatchQueueJobId({
    tenantId,
    workflowId,
    runId,
    dispatchKind: "public_start",
    actionToken: randomUUID()
  });
  const remoteScript = [
    "const { createPgPool, createPgPoolQueryClient, createPgTransactionRunner } = require('./dist/db/postgres-client.js');",
    "const { createAcidGuardRepository } = require('./dist/db/acid-guard-repository.js');",
    "const { createBullmqWorkflowRunEnqueuer } = require('./dist/workflows/bullmq-workflow-queue.js');",
    "const { createQueueOutboxWorker } = require('./dist/workflows/queue-outbox-worker.js');",
    `const tenantId = ${JSON.stringify(tenantId)};`,
    `const userId = ${JSON.stringify(userId)};`,
    `const workflowId = ${JSON.stringify(workflowId)};`,
    `const workflowTemplateId = ${JSON.stringify(workflowTemplateId)};`,
    `const runId = ${JSON.stringify(runId)};`,
    `const workflowIdentityKind = ${JSON.stringify(workflowIdentityKind)};`,
    `const redispatchIdempotencyKey = ${JSON.stringify(redispatchIdempotencyKey)};`,
    `const harnessPreparationMode = ${JSON.stringify(harnessPreparationMode)};`,
    "(async () => {",
    "  if (!process.env.WF_WORKFLOW_QUEUE_NAME || !process.env.WF_WORKFLOW_QUEUE_NAME.trim()) {",
    "    throw new Error('WF_WORKFLOW_QUEUE_NAME must be set for the direct native proof path. Refusing to fall back to the shared default queue.');",
    "  }",
    "  const pool = createPgPool({",
    "    connectionString: process.env.SUPABASE_DB_URL,",
    "    sslMode: process.env.SUPABASE_DB_SSL",
    "  });",
    "  const queryClient = createPgPoolQueryClient(pool);",
    "  const transactionRunner = createPgTransactionRunner(pool);",
    "  const repository = createAcidGuardRepository(transactionRunner);",
    "  const queueEnqueuer = createBullmqWorkflowRunEnqueuer({",
    "    redisUrl: process.env.REDIS_URL,",
    "    queueName: process.env.WF_WORKFLOW_QUEUE_NAME.trim()",
    "  });",
    "  const queueOutboxWorker = createQueueOutboxWorker({ repository, enqueuer: queueEnqueuer });",
    "  try {",
    "    const attemptedAt = new Date().toISOString();",
    "    const workflowResult = await queryClient.query(",
    "      'select package_id, provider_kind from wfpc.workflow_templates where tenant_id = $1 and id = $2 and enabled = true limit 1',",
    "      [tenantId, workflowTemplateId]",
    "    );",
    "    const workflowRow = workflowResult.rows[0] ?? null;",
    "    if (!workflowRow?.package_id || !workflowRow?.provider_kind) {",
    "      throw new Error('workflow bootstrap metadata missing for direct proof product path');",
    "    }",
    "    if (harnessPreparationMode === 'seeded_fresh_run') {",
    "      const reservation = await repository.reserveWorkflowRun({",
    "        tenantId,",
    "        userId,",
    "        workflowId,",
    "        workflowTemplateId,",
    "        workflowIdentityKind,",
    "        runId,",
    "        idempotencyKey: redispatchIdempotencyKey",
    "      });",
    "      if (!reservation.reserved) {",
    "        throw new Error(`Direct native proof reserveWorkflowRun failed: ${reservation.reason}`);",
    "      }",
    "    } else {",
    "      await repository.transitionWorkflowRunStatus({",
    "        tenantId,",
    "        runId,",
    "        from: ['queued', 'running', 'completed', 'failed', 'cancelled'],",
    "        to: 'queued'",
    "      });",
    "      const redispatch = await repository.stageWorkflowRunRedispatch({",
    "        tenantId,",
    "        runId,",
    "        userId,",
    "        idempotencyKey: redispatchIdempotencyKey",
    "      });",
    "      if (!redispatch.staged) {",
    "        throw new Error('Direct native proof redispatch did not stage an outbox row for the prepared harness run');",
    "      }",
    "    }",
    "    const drainResult = await queueOutboxWorker.drain({ limit: 8 });",
    "    console.log(JSON.stringify({",
    "      ok: true,",
    "      runId,",
    "      attemptedAt,",
    "      workflowIdentityKind,",
    "      workflowTemplateId,",
    "      workflowPackageId: String(workflowRow.package_id),",
    "      providerKind: String(workflowRow.provider_kind),",
    "      redispatchIdempotencyKey,",
    "      drainResult",
    "    }));",
    "  } finally {",
    "    await queueEnqueuer.close();",
    "    await pool.end();",
    "  }",
    "})().catch((error) => {",
    "  console.error(error);",
    "  process.exit(1);",
    "});"
  ].join(" ");
  const encodedRemoteScript = Buffer.from(remoteScript, "utf8").toString("base64");
  const remoteCommand =
    `printf '%s\\n' '${shellEscapeSingleQuotes(sudoPassword)}' | sudo -S -p '' docker exec '${shellEscapeSingleQuotes(containerName)}' sh -lc ` +
    `"cd /app && node -e \\\"eval(Buffer.from('${encodedRemoteScript}','base64').toString())\\\""`; 
  const result = await sshExec({
    sshTarget,
    remoteCommand,
    timeoutMs: 30000,
    maxBufferBytes: 1024 * 1024
  });
  return JSON.parse(result.stdout.trim() || "null");
}

function createProofRedispatchQueueJobId({ tenantId, workflowId, runId, dispatchKind, actionToken }) {
  const digest = createHash("sha256").update(actionToken).digest("hex").slice(0, 12);
  const normalizedWorkflowId = workflowId.replace(/[^a-z0-9_-]/gi, "_");
  const normalizedDispatchKind = dispatchKind.replace(/[^a-z_]/gi, "_");
  return `${tenantId}:${normalizedWorkflowId}:${runId}:redispatch:${normalizedDispatchKind}:${digest}`;
}

async function seedRemoteFreshHarnessRun({ sshTarget, sudoPassword, containerName, tenantId, workflowId, workflowTemplateId, runId, requireFreshRun }) {
  process.stdout.write("\n>> remote fresh harness bootstrap via wf-stage-api\n");
  const remoteScript = [
    "const pg = require('pg');",
    `const tenantId = ${JSON.stringify(tenantId)};`,
    `const workflowId = ${JSON.stringify(workflowId)};`,
    `const workflowTemplateId = ${JSON.stringify(workflowTemplateId ?? null)};`,
    `const runId = ${JSON.stringify(runId)};`,
    `const requireFreshRun = ${JSON.stringify(requireFreshRun === true)};`,
    "(async () => {",
    "  const { createPostgresHarnessRepository } = await import('./dist/harness/repository.js');",
    "  const { seedPublicWorkflowHarnessRun } = await import('./dist/harness/public-run-bootstrap.js');",
    "  const { createHarnessCardRecord, createHarnessCardContinuityRecord, createHarnessCardEventRecord } = await import('./dist/harness/types.js');",
    "  const client = new pg.Client({",
    "    connectionString: process.env.SUPABASE_DB_URL,",
    "    ssl: process.env.SUPABASE_DB_SSL === 'false' ? undefined : { rejectUnauthorized: true }",
    "  });",
    "  await client.connect();",
    "  try {",
    "    const repairBootstrap = {",
    "      wf_connect_first_workflow: {",
    "        persona: 'cfo',",
    "        title: 'Pressure-test the pricing lane',",
    "        deliverableType: 'pricing_review',",
    "        continuitySummary: 'CFO should begin this approved pricing review lane: Pressure-test the pricing lane.'",
    "      },",
    "      wf_tax_strategy: {",
    "        persona: 'cfo',",
    "        title: 'Review the founder tax posture',",
    "        deliverableType: 'tax_strategy_review',",
    "        continuitySummary: 'CFO should begin this approved tax strategy review lane: Review the founder tax posture.'",
    "      },",
    "      wf_package_followup: {",
    "        persona: 'cmo',",
    "        title: 'Draft the package follow-up narrative',",
    "        deliverableType: 'launch_copy',",
    "        continuitySummary: 'CMO should begin this approved launch copy lane: Draft the package follow-up narrative.'",
    "      }",
    "    };",
    "    const workflowResult = await client.query(",
    "      'select package_id, provider_kind from wfpc.workflow_templates where tenant_id = $1 and id = $2 and enabled = true limit 1',",
    "      [tenantId, workflowTemplateId ?? workflowId]",
    "    );",
    "    const workflowRow = workflowResult.rows[0] ?? null;",
    "    if (!workflowRow?.package_id || !workflowRow?.provider_kind) {",
    "      throw new Error('workflow bootstrap metadata missing for direct proof run');",
    "    }",
    "    const credentialResult = await client.query(",
    "      'select label from wfpc.secret_references where tenant_id = $1 and provider_kind = $2 and revoked_at is null limit 1',",
    "      [tenantId, workflowRow.provider_kind]",
    "    );",
    "    const credentialLabel = String(credentialResult.rows[0]?.label ?? '');",
    "    if (!credentialLabel) {",
    "      throw new Error('credential label missing for direct proof run');",
    "    }",
    "    const repository = createPostgresHarnessRepository(client);",
    "    const existingRunResult = await client.query(",
    "      'select id from wfpc.harness_runs where tenant_id = $1 and workflow_id = $2 limit 1',",
    "      [tenantId, workflowId]",
    "    );",
    "    const existingRunId = String(existingRunResult.rows[0]?.id ?? '');",
    "    if (requireFreshRun) {",
    "      if (existingRunId) {",
    "        console.log(JSON.stringify({",
    "          ok: false,",
    "          phase: 'fresh_harness_run_conflict',",
    "          existingRunId,",
    "          mode: 'existing_harness_run_conflicts_with_fresh_proof'",
    "        }));",
    "        return;",
    "      }",
    "      await seedPublicWorkflowHarnessRun({",
    "        repository,",
    "        tenantId,",
    "        runId,",
    "        workflowId,",
    "        packageId: String(workflowRow.package_id),",
    "        providerKind: String(workflowRow.provider_kind),",
    "        credentialLabel",
    "      });",
    "      console.log(JSON.stringify({ ok: true, runId, mode: 'seeded_fresh_run' }));",
    "      return;",
    "    }",
    "    if (!existingRunId) {",
    "      await seedPublicWorkflowHarnessRun({",
    "        repository,",
    "        tenantId,",
    "        runId,",
    "        workflowId,",
    "        packageId: String(workflowRow.package_id),",
    "        providerKind: String(workflowRow.provider_kind),",
    "        credentialLabel",
    "      });",
    "      console.log(JSON.stringify({ ok: true, runId, mode: 'seeded_fresh_run' }));",
    "      return;",
    "    }",
    "    const ceoCardResult = await client.query(",
    "      \"select id from wfpc.harness_cards where run_id = $1 and persona = 'ceo' limit 1\",",
    "      [existingRunId]",
    "    );",
    "    const ceoCardId = String(ceoCardResult.rows[0]?.id ?? '');",
    "    if (!ceoCardId) {",
    "      throw new Error(`Existing harness run ${existingRunId} is missing its CEO card`);",
    "    }",
    "    const childLaneResult = await client.query(",
    "      \"select id, state from wfpc.harness_cards where run_id = $1 and parent_card_id is not null and persona <> 'ceo' limit 1\",",
    "      [existingRunId]",
    "    );",
    "    if (childLaneResult.rows.length > 0) {",
    "      const existingLaneId = String(childLaneResult.rows[0]?.id ?? '');",
    "      const existingLaneState = String(childLaneResult.rows[0]?.state ?? '');",
    "      if (existingLaneState === 'approved') {",
    "        await repository.updateRunState({ runId: existingRunId, state: 'active' });",
    "        console.log(JSON.stringify({ ok: true, runId: existingRunId, mode: 'existing_lane_present', laneId: existingLaneId }));",
    "        return;",
    "      }",
    "      const rearmedLane = await repository.updateCardState({ cardId: existingLaneId, state: 'approved' });",
    "      if (!rearmedLane) {",
    "        throw new Error(`Existing harness run ${existingRunId} has a child lane that could not be re-armed`);",
    "      }",
    "      await repository.updateRunState({ runId: existingRunId, state: 'active' });",
    "      await repository.insertEvent(createHarnessCardEventRecord({",
    "        cardId: existingLaneId,",
    "        eventKind: 'state_changed',",
    "        payload: { from: existingLaneState || 'unknown', to: 'approved', reason: 'direct_native_proof_rearm' }",
    "      }));",
    "      console.log(JSON.stringify({ ok: true, runId: existingRunId, mode: 'rearmed_existing_lane', laneId: existingLaneId }));",
    "      return;",
    "    }",
    "    const bootstrap = repairBootstrap[workflowId];",
    "    if (!bootstrap) {",
    "      throw new Error(`No proof repair bootstrap is registered for ${workflowId}`);",
    "    }",
    "    const lane = {",
    "      ...createHarnessCardRecord({",
    "        runId: existingRunId,",
    "        parentCardId: ceoCardId,",
    "        persona: bootstrap.persona,",
    "        title: bootstrap.title,",
    "        deliverableType: bootstrap.deliverableType",
    "      }),",
    "      state: 'approved',",
    "      updatedAt: new Date().toISOString()",
    "    };",
    "    await repository.insertCard(lane);",
    "    await repository.insertEvent(createHarnessCardEventRecord({",
    "      cardId: lane.id,",
    "      eventKind: 'created',",
    "      payload: { title: lane.title, persona: lane.persona, state: lane.state }",
    "    }));",
    "    if (lane.state !== 'queued') {",
    "      await repository.insertEvent(createHarnessCardEventRecord({",
    "        cardId: lane.id,",
    "        eventKind: 'state_changed',",
    "        payload: { to: lane.state }",
    "      }));",
    "    }",
    "    await repository.upsertCardContinuity(createHarnessCardContinuityRecord({",
    "      cardId: lane.id,",
    "      runId: existingRunId,",
    "      continuitySummary: bootstrap.continuitySummary,",
    "      latestResultSummary: null,",
    "      absorbedWorkItems: []",
    "    }));",
    "    await repository.updateRunState({ runId: existingRunId, state: 'active' });",
    "    console.log(JSON.stringify({ ok: true, runId: existingRunId, mode: 'repaired_missing_lane', laneId: lane.id }));",
    "  } finally {",
    "    await client.end();",
    "  }",
    "})().catch((error) => {",
    "  console.error(error);",
    "  process.exit(1);",
    "});"
  ].join(" ");
  const encodedRemoteScript = Buffer.from(remoteScript, "utf8").toString("base64");
  const remoteCommand =
    `printf '%s\\n' '${shellEscapeSingleQuotes(sudoPassword)}' | sudo -S -p '' docker exec '${shellEscapeSingleQuotes(containerName)}' sh -lc ` +
    `"cd /app && node -e \\\"eval(Buffer.from('${encodedRemoteScript}','base64').toString())\\\""`; 
  const result = await sshExec({
    sshTarget,
    remoteCommand,
    timeoutMs: 30000,
    maxBufferBytes: 1024 * 1024
  });
  return JSON.parse(result.stdout.trim() || "null");
}

async function advanceNativeExecutionProof({ sshTarget, sudoPassword, containerName, tenantId, runId, workflowId, postAttemptedAt, timeoutMs }) {
  if (!normalizeValue(postAttemptedAt)) {
    return {
      ok: false,
      phase: "native_attempt_timestamp_missing",
      notes: [
        "The durable dashboard proof returned a run id, but the server-side run creation timestamp is missing.",
        "A fresh native outcome cannot be proven honestly without a durable server-side attempt timestamp."
      ],
      childLane: null,
      outcomeEvent: null
    };
  }

  const maxAttempts = Math.max(1, Math.ceil(Math.max(timeoutMs, 15_000) / 1_000));
  const acceptance = await waitForNativeExecutionAcceptance({
    tenantId,
    runId,
    postAttemptedAt,
    pollIntervalMs: 1_000,
    maxAttempts,
    loadState: ({ tenantId: snapshotTenantId, runId: snapshotRunId }) =>
      loadRemoteNativeExecutionState({
        sshTarget,
        sudoPassword,
        containerName,
        tenantId: snapshotTenantId,
        runId: snapshotRunId,
        postAttemptedAt
      }),
    ...buildNativeExecutionAcceptanceOptions(workflowId)
  });

  const childLane = acceptance.state?.lane ?? null;
  const outcomeEvent = acceptance.state?.event ?? null;
  if (acceptance.ok) {
    return {
      ok: true,
      phase: acceptance.phase,
      notes: acceptance.notes,
      childLane,
      outcomeEvent
    };
  }

  if (Number.isInteger(childLane?.laneCount) && childLane.laneCount !== 1) {
    return {
      ok: false,
      phase: "native_bootstrap_lane_mismatch",
      notes: [
        `Expected exactly one bootstrapped non-CEO lane for run ${runId}, but observed ${childLane.laneCount}.`,
        "This bounded live proof cannot trust outcome events until the bootstrap lane identity is unique."
      ],
      childLane,
      outcomeEvent
    };
  }

  return {
    ok: false,
    phase: acceptance.phase,
    notes: acceptance.notes,
    childLane,
    outcomeEvent
  };
}

async function loadRemoteNativeExecutionState({ sshTarget, sudoPassword, containerName, tenantId, runId, postAttemptedAt }) {
  const result = await runRemotePgQuery({
    sshTarget,
    sudoPassword,
    containerName,
    sql: [
      "select",
      "  run.id as run_id,",
      "  run.status as run_status,",
      "  outbox.id as outbox_id,",
      "  outbox.status as outbox_status,",
      "  outbox.last_error as outbox_last_error,",
      "  card.id as card_id,",
      "  card.persona as card_persona,",
      "  card.title as card_title,",
      "  card.state as card_state,",
      "  card.execution_claimed_at,",
      "  card.lane_count,",
      "  outcome_event.id as outcome_event_id,",
      "  outcome_event.created_at as outcome_event_created_at,",
      "  outcome_event.payload as outcome_event_payload",
      "from wfpc.workflow_runs run",
      "left join wfpc.workflow_queue_outbox outbox",
      "  on outbox.tenant_id = run.tenant_id",
      " and outbox.run_id = run.id",
      "left join lateral (",
      "  with child_lanes as (",
      "    select",
      "      card.id,",
      "      card.persona,",
      "      card.title,",
      "      card.state,",
      "      card.execution_claimed_at,",
      "      card.created_at,",
      "      count(*) over() as lane_count,",
      "      row_number() over (order by card.created_at asc, card.id asc) as lane_rank",
      "    from wfpc.harness_cards card",
      "    where card.run_id = run.id",
      "      and card.parent_card_id is not null",
      "      and card.persona <> 'ceo'",
      "  )",
      "  select",
      "    child_lanes.id,",
      "    child_lanes.persona,",
      "    child_lanes.title,",
      "    child_lanes.state,",
      "    child_lanes.execution_claimed_at,",
      "    child_lanes.lane_count",
      "  from child_lanes",
      "  where child_lanes.lane_rank = 1",
      ") card on true",
      "left join lateral (",
      "  select event.id, event.created_at, event.payload",
      "  from wfpc.harness_card_events event",
      "  where event.card_id = card.id",
      "    and event.event_kind = 'execution_outcome_committed'",
      "    and event.created_at > $3",
      "  order by event.created_at desc, event.id desc",
      "  limit 1",
      ") outcome_event on true",
      "where run.tenant_id = $1",
      "  and run.id = $2",
      "limit 1"
    ].join(" "),
    params: [tenantId, runId, postAttemptedAt]
  });
  const row = asRecord(result);
  return {
    run: {
      id: typeof row.run_id === "string" ? row.run_id : "",
      status: typeof row.run_status === "string" ? row.run_status : ""
    },
    outbox: {
      id: typeof row.outbox_id === "string" ? row.outbox_id : "",
      status: typeof row.outbox_status === "string" ? row.outbox_status : "",
      lastError: typeof row.outbox_last_error === "string" ? row.outbox_last_error : null
    },
    lane: typeof row.card_id === "string"
      ? {
          cardId: row.card_id,
          persona: typeof row.card_persona === "string" ? row.card_persona : "",
          title: typeof row.card_title === "string" ? row.card_title : "",
          state: typeof row.card_state === "string" ? row.card_state : "",
          attemptedAt: postAttemptedAt,
          executionClaimedAt: toIsoString(row.execution_claimed_at),
          laneCount: Number(row.lane_count ?? 0)
        }
      : null,
    event: typeof row.outcome_event_id === "string"
      ? {
          id: row.outcome_event_id,
          cardId: typeof row.card_id === "string" ? row.card_id : "",
          persona: typeof row.card_persona === "string" ? row.card_persona : "",
          eventKind: "execution_outcome_committed",
          createdAt: toIsoString(row.outcome_event_created_at),
          payload: row.outcome_event_payload && typeof row.outcome_event_payload === "object"
            ? row.outcome_event_payload
            : {}
        }
      : null
  };
}

function verifyNativeAcceptance({ durableResult, nativeAcceptance, advancementProof, expectedExecutionEngine }) {
  if (!durableResult.ok) {
    return {
      ok: false,
      phase: "durable_binding_not_verified",
      notes: [
        "The dashboard start did not reach the existing durable binding proof gate.",
        "Native execution acceptance is not trusted until the run and outbox rows verify cleanly."
      ]
    };
  }

  if (!nativeAcceptance?.runId) {
    return {
      ok: false,
      phase: "native_snapshot_missing",
      notes: [
        "The durable run row could not be reloaded with workflow definition snapshot data.",
        "Expected one workflow_runs row for the returned run id."
      ]
    };
  }

  if (nativeAcceptance.executionEngine && nativeAcceptance.executionEngine !== expectedExecutionEngine) {
    return {
      ok: false,
      phase: "execution_engine_mismatch",
      notes: [
        `Expected durable execution engine ${expectedExecutionEngine} but observed ${nativeAcceptance.executionEngine}.`,
        "This means the start did not land on the intended native stage lane."
      ]
    };
  }

  if (!advancementProof?.ok) {
    return {
      ok: false,
      phase: advancementProof?.phase ?? "native_execution_not_advanced",
      notes: advancementProof?.notes ?? [
        "The durable native execution engine resolved, but bounded child-lane advancement was not proven.",
        "Expected a fresh outcome committed event after the current attempt timestamp."
      ]
    };
  }

  return {
    ok: true,
    phase: "native_execution_verified",
    notes: [
      durableResult.verification?.phase === "durable_binding_verified"
        ? "Dashboard run request returned HTTP 202 and the durable binding proof passed."
        : "Direct public reservation persisted the durable run and queue rows with the expected bootstrap identity.",
      nativeAcceptance.executionEngine
        ? `The durable workflow_definition_snapshot executionEngine is ${expectedExecutionEngine}.`
        : "This start path does not persist executionEngine on workflow_definition_snapshot, so native routing is proven by the harness advancement event instead.",
      "A bootstrapped non-CEO child lane produced a fresh outcome committed event after the current attempt timestamp."
    ]
  };
}

function resolveAttentionResumeSummary({ workflowId, phase }) {
  if (workflowId === "wf_tax_strategy" && phase === "native_blocked_reached") {
    return "Founder tax posture documentation is now supplied. Resume the tax strategy lane from the latest restructuring assumptions workbook and finalize the bounded tax review.";
  }
  return null;
}

function resolveAttentionTaxStrategyEvidence({ workflowId, phase }) {
  if (workflowId !== "wf_tax_strategy" || phase !== "native_blocked_reached") {
    return null;
  }

  return {
    taxEvidenceSummary: "Founder tax posture documents were confirmed for bounded tax review.",
    taxEvidenceConfirmedBy: "operator",
    taxEvidenceTaxYear: "2025",
    taxEvidenceEntityType: "llc"
  };
}

function resolveCodexReadinessGate(input) {
  if (!CODEX_SUBSCRIPTION_WORKFLOW_IDS.has(input.workflowId)) {
    return {
      ok: true,
      phase: "codex_readiness_gate_not_required",
      notes: [
        `Codex auth-home readiness is not required for ${input.workflowId}; this lane does not use the OpenAI Codex subscription provider.`
      ]
    };
  }

  return validateCodexReadinessProofGate(input);
}

function verifyDirectNativeReservation({
  snapshot,
  workflowId,
  workflowIdentityKind,
  workflowTemplateId,
  workflowPackageId,
  providerKind
}) {
  if (!snapshot.run.id || !snapshot.outbox.id) {
    return {
      ok: false,
      phase: "durable_rows_missing",
      notes: [
        "Direct public reservation completed without proving both workflow run and queue outbox rows.",
        "Expected both rows to exist for the returned run id."
      ]
    };
  }

  if (snapshot.run.publicWorkflowId !== workflowId || snapshot.outbox.publicWorkflowId !== workflowId) {
    return {
      ok: false,
      phase: "workflow_identity_mismatch",
      notes: [
        "Direct public reservation did not preserve the requested public workflow id on both durable rows.",
        `Expected ${workflowId} on workflow_runs.public_workflow_id and workflow_queue_outbox.public_workflow_id.`
      ]
    };
  }

  if (
    snapshot.run.workflowIdentityKind !== workflowIdentityKind ||
    snapshot.outbox.workflowIdentityKind !== workflowIdentityKind
  ) {
    return {
      ok: false,
      phase: "workflow_identity_kind_mismatch",
      notes: [
        "Direct public reservation did not canonicalize both durable rows to the expected direct-proof identity kind.",
        `Expected workflow_runs.workflow_identity_kind and workflow_queue_outbox.workflow_identity_kind to be ${workflowIdentityKind}.`
      ]
    };
  }

  if (snapshot.outbox.status === "failed") {
    return {
      ok: false,
      phase: "outbox_failed",
      notes: [
        "Direct public reservation persisted the queue outbox in a failed state before worker pickup was proven.",
        `Last outbox error: ${snapshot.outbox.lastError ?? "unknown"}`
      ]
    };
  }

  if (workflowIdentityKind === "installed_package_overlay") {
    if (snapshot.run.workflowTemplateId || snapshot.outbox.workflowTemplateId) {
      return {
        ok: false,
        phase: "workflow_template_identity_mismatch",
        notes: [
          "Direct public reservation left workflow_template_id populated on at least one durable row.",
          "Expected workflow_runs.workflow_template_id and workflow_queue_outbox.workflow_template_id to be null for installed_package_overlay."
        ]
      };
    }
  } else if (
    snapshot.run.workflowTemplateId !== workflowTemplateId ||
    snapshot.outbox.workflowTemplateId !== workflowTemplateId
  ) {
    return {
      ok: false,
      phase: "workflow_template_identity_mismatch",
      notes: [
        "Direct public reservation did not preserve the resolved tenant workflow template id on both durable rows.",
        `Expected ${workflowTemplateId} on workflow_runs.workflow_template_id and workflow_queue_outbox.workflow_template_id.`
      ]
    };
  }

  const workflowDefinitionSnapshot =
    snapshot.run.workflowDefinitionSnapshot && typeof snapshot.run.workflowDefinitionSnapshot === "object"
      ? snapshot.run.workflowDefinitionSnapshot
      : null;

  if (workflowIdentityKind === "installed_package_overlay") {
    const requiredCapabilities = Array.isArray(workflowDefinitionSnapshot?.requiredCapabilities)
      ? workflowDefinitionSnapshot.requiredCapabilities.filter((entry) => typeof entry === "string")
      : [];
    if (
      !workflowDefinitionSnapshot ||
      workflowDefinitionSnapshot.publicWorkflowId !== workflowId ||
      workflowDefinitionSnapshot.packageId !== workflowPackageId ||
      workflowDefinitionSnapshot.executionEngine !== expectedExecutionEngine ||
      workflowDefinitionSnapshot.providerKind !== providerKind ||
      !requiredCapabilities.includes("text_generation")
    ) {
      return {
        ok: false,
        phase: "workflow_definition_snapshot_mismatch",
        notes: [
          "Direct public reservation did not persist the canonical installed-package overlay snapshot for native execution.",
          "Expected workflow_definition_snapshot to preserve publicWorkflowId, packageId, executionEngine, requiredCapabilities, and providerKind."
        ]
      };
    }
  } else if (workflowDefinitionSnapshot && Object.keys(workflowDefinitionSnapshot).length > 0) {
    return {
      ok: false,
      phase: "workflow_definition_snapshot_mismatch",
      notes: [
        "Direct public reservation persisted an unexpected workflow_definition_snapshot for a core built-in tenant-template run.",
        "Expected workflow_definition_snapshot to remain empty while the worker resolves the tenant workflow definition."
      ]
    };
  }

  if (!snapshot.run.boundSecretReferenceId || snapshot.run.providerContext.length !== 1) {
    return {
      ok: false,
      phase: "binding_missing",
      notes: [
        "Direct public reservation did not persist the expected single bound provider context.",
        "Expected one bound provider context entry and a bound secret reference on the workflow run."
      ]
    };
  }

  return {
    ok: true,
    phase: "direct_public_reservation_verified",
    notes: [
      workflowIdentityKind === "installed_package_overlay"
        ? "Direct public reservation canonicalized the durable run and queue rows to the installed-package overlay identity."
        : "Direct public reservation canonicalized the durable run and queue rows to the tenant-template identity expected by the core built-in worker path.",
      workflowIdentityKind === "installed_package_overlay"
        ? "Workflow run and queue outbox rows preserve one bound provider context, a null workflow_template_id, and a native workflow_definition_snapshot."
        : "Workflow run and queue outbox rows preserve one bound provider context, the resolved workflow_template_id, and an empty workflow_definition_snapshot."
    ]
  };
}

async function runRemotePgQuery({ sshTarget, sudoPassword, containerName, sql, params }) {
  process.stdout.write("\n>> remote native workflow snapshot via wf-stage-api\n");
  const remoteScript = [
    "const pg = require('pg');",
    `const sql = ${JSON.stringify(sql)};`,
    `const params = ${JSON.stringify(params)};`,
    "(async () => {",
    "  const client = new pg.Client({",
    "    connectionString: process.env.SUPABASE_DB_URL,",
    "    ssl: process.env.SUPABASE_DB_SSL === 'false' ? undefined : { rejectUnauthorized: true }",
    "  });",
    "  await client.connect();",
    "  const result = await client.query(sql, params);",
    "  console.log(JSON.stringify(result.rows[0] ?? null));",
    "  await client.end();",
    "})().catch((error) => {",
    "  console.error(error);",
    "  process.exit(1);",
    "});"
  ].join(" ");
  const encodedRemoteScript = Buffer.from(remoteScript, "utf8").toString("base64");
  const remoteCommand =
    `printf '%s\\n' '${shellEscapeSingleQuotes(sudoPassword)}' | sudo -S -p '' docker exec '${shellEscapeSingleQuotes(containerName)}' sh -lc ` +
    `"cd /app && node -e \\\"eval(Buffer.from('${encodedRemoteScript}','base64').toString())\\\""`; 
  const commandResult = await sshExec({
    sshTarget,
    remoteCommand,
    timeoutMs: 30000,
    maxBufferBytes: 1024 * 1024
  });
  return JSON.parse(commandResult.stdout.trim() || "null");
}

function sshExec({ sshTarget, remoteCommand, timeoutMs, maxBufferBytes }) {
  return new Promise((resolve, reject) => {
    const child = spawn("ssh", [sshTarget, remoteCommand], {
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      child.kill("SIGKILL");
      reject(new Error(`SSH command timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdoutBytes += chunk.length;
      if (stdoutBytes > maxBufferBytes) {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          child.kill("SIGKILL");
          reject(new Error(`SSH stdout exceeded ${maxBufferBytes} bytes`));
        }
        return;
      }
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderrBytes += chunk.length;
      if (stderrBytes > maxBufferBytes) {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          child.kill("SIGKILL");
          reject(new Error(`SSH stderr exceeded ${maxBufferBytes} bytes`));
        }
        return;
      }
      stderr += String(chunk);
    });
    child.on("error", (error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
    child.on("exit", (code) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(stderr.trim() || `SSH command exited with code ${code ?? "unknown"}`));
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

function runCommand(label, command, commandArgs, options) {
  process.stdout.write(`\n>> ${label}\n`);
  const result = spawnSync(command, commandArgs, {
    cwd: process.cwd(),
    shell: process.platform === "win32" && /\.cmd$/i.test(command),
    stdio: "inherit",
    ...options
  });
  if (typeof result.status === "number" && result.status !== 0) {
    process.exit(result.status);
  }
  if (result.error) {
    throw result.error;
  }
}

function parseRole(value) {
  const normalized = normalizeValue(value) ?? "member";
  if (normalized !== "member" && normalized !== "operator") {
    throw new Error("--role must be member or operator");
  }
  return normalized;
}

function parseExpiresInMinutes(value) {
  const normalized = normalizeValue(value);
  if (!normalized) {
    return 15;
  }
  const parsed = Number(normalized);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 60) {
    throw new Error("--expires-in-minutes must be an integer between 1 and 60");
  }
  return parsed;
}

function parsePositiveInteger(value, label) {
  const normalized = normalizeValue(value);
  if (!normalized) {
    throw new Error(`--${label} is required`);
  }
  const parsed = Number(normalized);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`--${label} must be a positive integer`);
  }
  return parsed;
}

function requireArg(args, name) {
  const value = normalizeValue(args[name]);
  if (!value) {
    throw new Error(`Missing required arg --${name}`);
  }
  return value;
}

function requireOrigin(value, envName) {
  const normalized = normalizeValue(value);
  if (!normalized) {
    throw new Error(`${envName} is required`);
  }
  return normalized.replace(/\/$/, "");
}

function buildDefaultSshTarget(env) {
  const user = normalizeValue(env.VPS2_USER);
  const host = normalizeValue(env.VPS2_HOST);
  if (!user || !host) {
    return null;
  }
  return `${user}@${host}`;
}

function normalizeValue(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value ?? ""));
}

function shellEscapeSingleQuotes(value) {
  return value.replace(/'/g, `'\"'\"'`);
}

function shellEscapeForSh(value) {
  return `'${String(value).replace(/'/g, `'\"'\"'`)}'`;
}

function escapeDoubleQuotes(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function toIsoString(value) {
  if (typeof value === "string") {
    return value;
  }
  return value instanceof Date ? value.toISOString() : null;
}

function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
