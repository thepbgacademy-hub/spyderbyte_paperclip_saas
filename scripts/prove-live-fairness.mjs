import { execFile } from "node:child_process";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";
import { promisify } from "node:util";

import pg from "pg";

import { createLiveRunRequest, loadWorkflowRunSnapshot } from "./lib/live-run-drive.mjs";
import { buildPressureLanes, expandPressureRequests, summarizePressureProof } from "./lib/pressure-drive.mjs";
import {
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
const requests = expandPressureRequests({
  lanes,
  order: parseOrderArg(args.order),
  cycles: parsePositiveInteger(args.cycles, 1, "cycles")
}).map((request, index) => {
  const run = createLiveRunRequest({
    tenantId: request.tenantId,
    userId: request.userId,
    workflowId: request.workflowId
  });
  return {
    lane: request.lane,
    tenantId: request.tenantId,
    userId: request.userId,
    workflowId: request.workflowId,
    runId: run.runId,
    idempotencyKey: run.idempotencyKey,
    sequence: request.sequence,
    ...(Number.isInteger(request.cycle) ? { cycle: request.cycle } : {}),
    ordinal: index + 1
  };
});

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
  const preflightResults = [];
  for (const lane of lanes) {
    const preflight = await loadRuntimePreflight({
      client,
      tenantId: lane.tenantId,
      workflowId: lane.workflowId
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
      const queueResult = await queuePressureRun(request);
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
                jobId: `${request.tenantId}:${request.workflowId}:${request.runId}`
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
                postSuccessObservationMs
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
              postSuccessObservationMs
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

async function queuePressureRun(request) {
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
      "--run",
      request.runId
    ],
    {
      cwd: process.cwd(),
      env: process.env
    }
  );

  return JSON.parse(stdout);
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
