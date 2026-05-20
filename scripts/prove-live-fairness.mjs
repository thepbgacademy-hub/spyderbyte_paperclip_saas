import { execFile } from "node:child_process";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";
import { promisify } from "node:util";

import pg from "pg";

import { createLiveRunRequest, loadWorkflowRunSnapshot } from "./lib/live-run-drive.mjs";
import { createPressureRequests, summarizePressureProof } from "./lib/pressure-drive.mjs";
import { inspectQueueState } from "./lib/queue-inspection.mjs";
import { loadRuntimePreflight, summarizeRuntimePreflight } from "./lib/runtime-preflight.mjs";
import { loadScriptEnv } from "./lib/script-env.mjs";

const env = loadScriptEnv();
const args = parseArgs(process.argv.slice(2));
const lanes = buildLanes(args);
const execFileAsync = promisify(execFile);
const primaryRuns = parseRunsArg(args["primary-runs"], 2, "primary-runs");
const secondaryRuns = parseRunsArg(args["secondary-runs"], 1, "secondary-runs");
const tertiaryRuns = parseRunsArg(args["tertiary-runs"], 0, "tertiary-runs", { allowZero: true });
const mode = parseModeArg(args.mode);
const requests = createPressureRequests({
  lanes,
  runsPerLane: 1,
  order: "alternating"
}).flatMap((request) => {
  const sourceLane = lanes.find((lane) => lane.lane === request.lane);
  const runsForLane = request.lane === "primary"
    ? primaryRuns
    : request.lane === "secondary"
      ? secondaryRuns
      : tertiaryRuns;
  return Array.from({ length: runsForLane }, () =>
    createLiveRunRequest({
      tenantId: request.tenantId,
      userId: sourceLane.userId,
      workflowId: sourceLane.workflowId
    })).map((run, index) => ({
      lane: request.lane,
      tenantId: request.tenantId,
      userId: sourceLane.userId,
      workflowId: sourceLane.workflowId,
      runId: run.runId,
      idempotencyKey: run.idempotencyKey,
      sequence: index + 1
    }));
}).sort((left, right) => left.sequence - right.sequence || left.lane.localeCompare(right.lane));

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
  const preflightResults = await Promise.all(
    lanes.map(async (lane) => {
      const preflight = await loadRuntimePreflight({
        client,
        tenantId: lane.tenantId,
        workflowId: lane.workflowId
      });
      return {
        lane: lane.lane,
        preflight,
        summary: summarizeRuntimePreflight(preflight)
      };
    })
  );

  const failedPreflight = preflightResults.find((result) => !result.summary.ok);
  if (failedPreflight) {
    process.exitCode = 1;
    process.stdout.write(JSON.stringify({ ok: false, phase: "preflight_failed", preflight: preflightResults }, null, 2) + "\n");
  } else {
    let queueFailure = false;
    for (const request of requests) {
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
    }

    if (!queueFailure) {
      const startedAt = Date.now();
      const deadlineMs = Number.parseInt(args.timeout ?? "45000", 10);
      const pollIntervalMs = Number.parseInt(args.interval ?? "1500", 10);
      const observations = new Map();

      while (Date.now() - startedAt < deadlineMs) {
        for (const request of requests) {
          const snapshot = await loadWorkflowRunSnapshot({
            client,
            tenantId: request.tenantId,
            runId: request.runId
          });
          const queue = await inspectQueueState({
            redisUrl: env.REDIS_URL,
            queueName: env.WF_WORKFLOW_QUEUE_NAME?.trim() || "wfpc-workflow-runs",
            jobId: `${request.tenantId}:${request.workflowId}:${request.runId}`
          });
          const previous = observations.get(request.runId) ?? null;
          const progressing = isProgressing(snapshot.run.status, queue.state);
          observations.set(request.runId, {
            lane: request.lane,
            tenantId: request.tenantId,
            runId: request.runId,
            workflowId: request.workflowId,
            runStatus: snapshot.run.status,
            outboxStatus: snapshot.outbox.status,
            queueState: queue.state,
            outboxAttempts: snapshot.outbox.attempts,
            queueReachable: queue.reachable,
            queuedAt: previous?.queuedAt ?? snapshot.outbox.createdAt ?? snapshot.run.createdAt ?? request.queuedAt ?? new Date().toISOString(),
            observedFirstProgressAt: previous?.observedFirstProgressAt ?? (progressing ? new Date().toISOString() : null),
            observedFirstStartedAt: previous?.observedFirstStartedAt ?? (snapshot.run.status === "running" || snapshot.run.status === "completed" ? new Date().toISOString() : null),
            observedCompletedAt: previous?.observedCompletedAt ?? (snapshot.run.status === "completed" ? new Date().toISOString() : null)
          });
        }

        const summary = summarizePressureProof({
          requests,
          snapshots: [...observations.values()],
          mode
        });

        if (summary.ok) {
          process.stdout.write(
            JSON.stringify(
              {
                ok: true,
                phase: summary.phase,
                requests,
                snapshots: [...observations.values()],
                summary
              },
              null,
              2
            ) + "\n"
          );
          break;
        }

        await delay(pollIntervalMs);
      }

      const summary = summarizePressureProof({
        requests,
        snapshots: [...observations.values()],
        mode
      });
      if (!summary.ok || process.exitCode) {
        process.exitCode = summary.ok ? process.exitCode ?? 0 : 1;
        process.stdout.write(
          JSON.stringify(
            {
              ok: summary.ok,
              phase: summary.phase,
              requests,
              snapshots: [...observations.values()],
              summary
            },
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
    args[value.slice(2)] = values[index + 1];
    index += 1;
  }
  return args;
}

function buildLanes(args) {
  const required = [
    "primary-tenant",
    "primary-user",
    "primary-workflow",
    "secondary-tenant",
    "secondary-user",
    "secondary-workflow"
  ];
  const missing = required.filter((key) => !args[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required args: ${missing.map((key) => `--${key}`).join(", ")}`);
  }

  return [
    {
      lane: "primary",
      tenantId: args["primary-tenant"],
      userId: args["primary-user"],
      workflowId: args["primary-workflow"]
    },
    {
      lane: "secondary",
      tenantId: args["secondary-tenant"],
      userId: args["secondary-user"],
      workflowId: args["secondary-workflow"]
    },
    ...buildOptionalLane(args, "tertiary")
  ];
}

function buildOptionalLane(args, prefix) {
  const required = [`${prefix}-tenant`, `${prefix}-user`, `${prefix}-workflow`];
  const present = required.filter((key) => Boolean(args[key]));
  if (present.length === 0) {
    return [];
  }
  if (present.length !== required.length) {
    throw new Error(`Optional ${prefix} lane requires --${required.join(", --")}`);
  }
  return [{
    lane: prefix,
    tenantId: args[`${prefix}-tenant`],
    userId: args[`${prefix}-user`],
    workflowId: args[`${prefix}-workflow`]
  }];
}

function parseRunsArg(value, fallback, label, options = {}) {
  if (value === undefined) {
    return fallback;
  }

  if (!/^\d+$/.test(value)) {
    throw new Error(`Invalid --${label}: expected a ${options.allowZero ? "non-negative" : "positive"} integer`);
  }

  const parsed = Number.parseInt(value, 10);
  const minimum = options.allowZero ? 0 : 1;
  if (parsed < minimum) {
    throw new Error(`Invalid --${label}: expected a ${options.allowZero ? "non-negative" : "positive"} integer`);
  }

  return parsed;
}

function parseModeArg(value) {
  if (value === undefined) {
    return "progress";
  }

  if (value !== "progress" && value !== "drain") {
    throw new Error("Invalid --mode: expected 'progress' or 'drain'");
  }

  return value;
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
