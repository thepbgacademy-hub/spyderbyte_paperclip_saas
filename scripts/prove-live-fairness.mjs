import { execFile } from "node:child_process";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";
import { promisify } from "node:util";

import pg from "pg";

import { createLiveRunRequest, loadWorkflowRunSnapshot } from "./lib/live-run-drive.mjs";
import { alignDurableHarnessProofPlan } from "./lib/native-proof-lane-model.mjs";
import { buildPressureLanes, expandPressureRequests, summarizePressureProof } from "./lib/pressure-drive.mjs";
import {
  applyQueuedRunIdentity,
  buildProofOutput,
  parseModeArg,
  shouldInspectQueueState,
  updateSuccessWindow
} from "./lib/prove-live-fairness-support.mjs";
import { inspectQueueSnapshot, inspectQueueState } from "./lib/queue-inspection.mjs";
import { loadRuntimePreflight, summarizeRuntimePreflight } from "./lib/runtime-preflight.mjs";
import { loadScriptEnv } from "./lib/script-env.mjs";

const env = loadScriptEnv();
const args = parseArgs(process.argv.slice(2));
const lanes = buildPressureLanes({
  args,
  laneSpecs: toArray(args.lane)
});
const execFileAsync = promisify(execFile);
const modeConfig = parseModeArg(args.mode);
const dashboardStartContext = await createDashboardStartContext(env);

const client = new pg.Client({
  connectionString: env.SUPABASE_DB_URL,
  ssl: resolveSsl(env)
});

let closing = false;
client.on("error", (error) => {
  if (!closing) {
    throw error;
  }
});

await client.connect();

try {
  const resolvedLanes = [];
  for (const lane of lanes) {
    resolvedLanes.push({
      ...lane,
      workflowTemplateId: await resolveTemplateWorkflowId({
        client,
        tenantId: lane.tenantId,
        workflowId: lane.workflowId
      })
    });
  }
  const workflowTemplateIdByLane = new Map(
    resolvedLanes.map((lane) => [`${lane.lane}:${lane.tenantId}:${lane.userId}:${lane.workflowId}`, lane.workflowTemplateId])
  );
  const alignedProofPlan = alignDurableHarnessProofPlan({
    lanes: resolvedLanes,
    cycles: parsePositiveInteger(args.cycles, 1, "cycles")
  });
  const requests = expandPressureRequests({
    lanes: alignedProofPlan.lanes,
    order: parseOrderArg(args.order),
    cycles: alignedProofPlan.cycles
  }).map((request, index) => {
    const workflowTemplateId = workflowTemplateIdByLane.get(
      `${request.lane}:${request.tenantId}:${request.userId}:${request.workflowId}`
    );
    const run = createLiveRunRequest({
      tenantId: request.tenantId,
      userId: request.userId,
      workflowId: request.workflowId,
      ...(workflowTemplateId ? { workflowTemplateId } : {})
    });
    return {
      lane: request.lane,
      tenantId: request.tenantId,
      userId: request.userId,
      workflowId: request.workflowId,
      ...(workflowTemplateId ? { workflowTemplateId } : {}),
      runId: run.runId,
      idempotencyKey: run.idempotencyKey,
      sequence: request.sequence,
      ...(Number.isInteger(request.cycle) ? { cycle: request.cycle } : {}),
      ordinal: index + 1
    };
  });
  const preflightResults = [];
  for (const lane of resolvedLanes) {
    const preflight = await loadRuntimePreflight({
      client,
      tenantId: lane.tenantId,
      workflowId: lane.workflowTemplateId
    });
    preflightResults.push({
      lane: lane.lane,
      preflight,
      summary: summarizeRuntimePreflight(preflight)
    });
  }

  const failedPreflight = preflightResults.find((result) => !result.summary.ok);
  if (failedPreflight) {
    process.exitCode = 1;
    process.stdout.write(JSON.stringify({ ok: false, phase: "preflight_failed", preflight: preflightResults }, null, 2) + "\n");
  } else {
    const cycleIntervalMs = parsePositiveInteger(args["cycle-interval-ms"], 0, "cycle-interval-ms", { allowZero: true });
    const queueIntervalMs = parsePositiveInteger(args["queue-interval-ms"], 0, "queue-interval-ms", { allowZero: true });
    let previousCycle = null;
    let queueFailure = false;
    for (let requestIndex = 0; requestIndex < requests.length; requestIndex += 1) {
      const request = requests[requestIndex];
      const crossedCycleBoundary =
        previousCycle !== null && request.cycle !== undefined && request.cycle !== previousCycle;
      if (crossedCycleBoundary && cycleIntervalMs > 0) {
        await delay(cycleIntervalMs);
      }
      if (requestIndex > 0 && queueIntervalMs > 0 && !crossedCycleBoundary) {
        await delay(queueIntervalMs);
      }
      const queueResult = await queuePressureRun(request, dashboardStartContext);
      if (!queueResult.ok) {
        queueFailure = true;
        process.exitCode = 1;
        process.stdout.write(
          JSON.stringify(
            {
              ok: false,
              phase: "queue_failed",
              request,
              queueResult
            },
            null,
            2
          ) + "\n"
        );
        break;
      }
      request.queuedAt = queueResult.snapshot?.outbox?.createdAt ?? queueResult.snapshot?.run?.createdAt ?? new Date().toISOString();
      previousCycle = request.cycle ?? previousCycle;
    }

    if (!queueFailure) {
      const startedAt = Date.now();
      const deadlineMs = Number.parseInt(args.timeout ?? "45000", 10);
      const pollIntervalMs = Number.parseInt(args.interval ?? "1500", 10);
      const postSuccessObservationMs = parsePositiveInteger(
        args["post-success-observation-ms"],
        0,
        "post-success-observation-ms",
        { allowZero: true }
      );
      const observations = new Map();
      const queueSnapshots = [];
      let successObservedAt = null;
      let emittedResult = false;

      while (Date.now() - startedAt < deadlineMs) {
        for (const request of requests) {
          const snapshot = await loadWorkflowRunSnapshot({
            client,
            tenantId: request.tenantId,
            runId: request.runId
          });
          const previous = observations.get(request.runId) ?? null;
          const queue = shouldInspectQueueState({
            runStatus: snapshot.run.status,
            previousObservation: previous
          })
            ? await inspectQueueState({
                redisUrl: env.REDIS_URL,
                queueName: env.WF_WORKFLOW_QUEUE_NAME?.trim() || "wfpc-workflow-runs",
                jobId: `${request.tenantId}:${request.workflowId}:${request.runId}`,
                runId: request.runId
              })
            : {
                queueName: env.WF_WORKFLOW_QUEUE_NAME?.trim() || "wfpc-workflow-runs",
                jobId: `${request.tenantId}:${request.workflowId}:${request.runId}`,
                state: previous?.queueState ?? null,
                reachable: previous?.queueReachable ?? true,
                error: previous?.queueError ?? null
              };
          const progressing = isProgressing(snapshot.run.status, queue.state);
          observations.set(request.runId, {
            lane: request.lane,
            tenantId: request.tenantId,
            runId: request.runId,
            workflowId: request.workflowId,
            runStatus: snapshot.run.status,
            outboxStatus: snapshot.outbox.status,
            queueState: queue.state,
            queueError: queue.error,
            outboxAttempts: snapshot.outbox.attempts,
            queueReachable: queue.reachable,
            queuedAt: previous?.queuedAt ?? snapshot.outbox.createdAt ?? snapshot.run.createdAt ?? request.queuedAt ?? new Date().toISOString(),
            observedFirstProgressAt: previous?.observedFirstProgressAt ?? (progressing ? new Date().toISOString() : null),
            observedFirstStartedAt: previous?.observedFirstStartedAt ?? (snapshot.run.status === "running" || snapshot.run.status === "completed" ? new Date().toISOString() : null),
            observedCompletedAt: previous?.observedCompletedAt ?? (snapshot.run.status === "completed" ? new Date().toISOString() : null)
          });
        }
        queueSnapshots.push({
          observedAt: new Date().toISOString(),
          ...(await inspectQueueSnapshot({
            redisUrl: env.REDIS_URL,
            queueName: env.WF_WORKFLOW_QUEUE_NAME?.trim() || "wfpc-workflow-runs"
          }))
        });

        const summary = summarizePressureProof({
          requests,
          snapshots: [...observations.values()],
          queueSnapshots,
          mode: modeConfig.summaryMode
        });

        const successWindow = updateSuccessWindow({
          summaryOk: summary.ok,
          nowMs: Date.now(),
          postSuccessObservationMs,
          successObservedAt
        });
        successObservedAt = successWindow.successObservedAt;

        if (summary.ok && successWindow.readyToFinalize) {
          process.stdout.write(
            JSON.stringify(
              buildProofOutput({
                modeConfig,
              summary,
              requests,
              snapshots: [...observations.values()],
              queueSnapshots,
              observationDurationMs: Date.now() - startedAt,
              postSuccessObservationMs,
              additionalNotes: alignedProofPlan.notes
            }),
            null,
            2
            ) + "\n"
          );
          emittedResult = true;
          break;
        }

        await delay(pollIntervalMs);
      }

      const summary = summarizePressureProof({
        requests,
        snapshots: [...observations.values()],
        queueSnapshots,
        mode: modeConfig.summaryMode
      });
      if (!emittedResult) {
        if (!summary.ok) {
          process.exitCode = 1;
        }
        process.stdout.write(
          JSON.stringify(
            buildProofOutput({
              modeConfig,
              summary,
              requests,
              snapshots: [...observations.values()],
              queueSnapshots,
              observationDurationMs: Date.now() - startedAt,
              postSuccessObservationMs,
              additionalNotes: alignedProofPlan.notes
            }),
            null,
            2
            ) + "\n"
          );
      }
    }
  }
} finally {
  closing = true;
  await client.end();
}

async function queuePressureRun(request, dashboardStartContext) {
  if (dashboardStartContext) {
    return queuePressureRunViaDashboardApi(request, dashboardStartContext);
  }
  const { stdout } = await execFileAsync(
    process.execPath,
    [
      "scripts/queue-live-workflow-run.mjs",
      "--tenant",
      request.tenantId,
      "--user",
      request.userId,
      "--workflow",
      request.workflowId,
      ...(request.workflowTemplateId ? ["--workflow-template", request.workflowTemplateId] : []),
      "--run",
      request.runId
    ],
    {
      cwd: process.cwd(),
      env: process.env
    }
  );

  return applyQueuedRunIdentity({
    request,
    queueResult: JSON.parse(stdout)
  });
}

async function queuePressureRunViaDashboardApi(request, dashboardStartContext) {
  const sessionToken = dashboardStartContext.getSessionToken({
    tenantId: request.tenantId,
    userId: request.userId
  });
  const response = await fetch(`${dashboardStartContext.baseUrl}/api/dashboard/runs`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: dashboardStartContext.portalOrigin,
      cookie: `${dashboardStartContext.sessionCookieName}=${sessionToken}`
    },
    body: JSON.stringify({
      workflowId: request.workflowTemplateId ?? request.workflowId
    })
  });

  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (response.status !== 202 || !body || body.queued !== true || typeof body.runId !== "string" || body.runId.trim().length === 0) {
    return {
      ok: false,
      error: {
        status: response.status,
        body
      }
    };
  }

  return applyQueuedRunIdentity({
    request,
    queueResult: {
      ok: true,
      result: {
        queued: true,
        runId: body.runId.trim()
      }
    }
  });
}

function parseArgs(values) {
  const args = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value.startsWith("--")) {
      continue;
    }
    const key = value.slice(2);
    const next = values[index + 1];
    if (Object.hasOwn(args, key)) {
      const previous = args[key];
      args[key] = Array.isArray(previous) ? [...previous, next] : [previous, next];
    } else {
      args[key] = next;
    }
    index += 1;
  }
  return args;
}

function parseOrderArg(value) {
  if (value === undefined || value === null || String(value).trim().length === 0) {
    return "alternating";
  }
  const normalized = String(value).trim();
  if (normalized === "alternating" || normalized === "grouped" || normalized === "staggered") {
    return normalized;
  }
  throw new Error("Invalid --order: expected 'alternating', 'grouped', or 'staggered'");
}

function resolveSsl(source) {
  if (
    source.SUPABASE_DB_SSL === "false" ||
    source.SUPABASE_DB_URL.includes("localhost") ||
    source.SUPABASE_DB_URL.includes("127.0.0.1")
  ) {
    return undefined;
  }

  return { rejectUnauthorized: true };
}

function isProgressing(runStatus, queueState) {
  return runStatus === "running" ||
    runStatus === "completed" ||
    runStatus === "failed" ||
    queueState === "active" ||
    queueState === "completed";
}

function parsePositiveInteger(value, fallback, label, options = {}) {
  const allowZero = options.allowZero === true;
  if (value === undefined || value === null || String(value).trim().length === 0) {
    return fallback;
  }
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isInteger(parsed) || parsed < 0 || (!allowZero && parsed < 1)) {
    throw new Error(`Expected --${label} to be a ${allowZero ? "non-negative" : "positive"} integer`);
  }
  return parsed;
}

function toArray(value) {
  if (Array.isArray(value)) {
    return value;
  }
  return value ? [value] : [];
}

async function resolveTemplateWorkflowId({ client, tenantId, workflowId }) {
  if (isUuid(workflowId)) {
    return workflowId;
  }
  const result = await client.query(
    `select id
     from wfpc.workflow_templates
     where tenant_id = $1
     order by created_at desc`,
    [tenantId]
  );
  if (result.rows.length !== 1) {
    throw new Error(
      `Expected exactly one workflow template for tenant ${tenantId} when resolving public workflow ${workflowId}, found ${result.rows.length}`
    );
  }
  return String(result.rows[0]?.id ?? "");
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value ?? ""));
}

async function createDashboardStartContext(source) {
  const baseUrl = normalizeHttpOrigin(source.WF_LIVE_BASE_URL ?? source.WF_STAGE_API_ORIGIN);
  const portalOrigin = normalizeHttpOrigin(source.WF_SMOKE_PORTAL_URL ?? source.WF_STAGE_PORTAL_ORIGIN);
  const sessionCookieName = typeof source.WF_PORTAL_SESSION_COOKIE_NAME === "string" && source.WF_PORTAL_SESSION_COOKIE_NAME.trim().length > 0
    ? source.WF_PORTAL_SESSION_COOKIE_NAME.trim()
    : "wf_portal_session";
  if (!baseUrl || !portalOrigin) {
    return null;
  }

  try {
    const { createRuntimeSessionToken, loadRuntimeSessionAuthEnv } = await import("../dist/api/runtime-auth.js");
    const runtimeAuthEnv = loadRuntimeSessionAuthEnv(source);
    return {
      baseUrl,
      portalOrigin,
      sessionCookieName,
      getSessionToken({ tenantId, userId }) {
        return createRuntimeSessionToken({
          signingKey: runtimeAuthEnv.signingKey,
          issuer: runtimeAuthEnv.issuer,
          audience: runtimeAuthEnv.audience,
          session: {
            tenantId,
            userId,
            role: "member"
          },
          expiresAt: new Date(Date.now() + 15 * 60_000)
        });
      }
    };
  } catch {
    return null;
  }
}

function normalizeHttpOrigin(value) {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim().replace(/\/$/, "")
    : null;
}
