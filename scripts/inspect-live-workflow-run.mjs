import { readFileSync } from "node:fs";
import process from "node:process";

import { Queue } from "bullmq";
import { Redis } from "ioredis";
import pg from "pg";

import { loadWorkflowRunSnapshot, summarizeWorkflowRunVerification } from "./lib/live-run-drive.mjs";

const env = Object.fromEntries(
  readFileSync(".env", "utf8")
    .split(/\r?\n/)
    .filter((line) => line.trim() && !line.trim().startsWith("#"))
    .map((line) => line.split(/=(.*)/s).slice(0, 2))
);

const args = parseArgs(process.argv.slice(2));
if (!args.tenant || !args.run || !args.workflow) {
  throw new Error("Missing required args: --tenant, --workflow, --run");
}

const client = new pg.Client({
  connectionString: env.SUPABASE_DB_URL,
  ssl: resolveSsl(env)
});
const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
const queue = new Queue(env.WF_WORKFLOW_QUEUE_NAME?.trim() || "wfpc-workflow-runs", { connection });

await client.connect();

try {
  const snapshot = await loadWorkflowRunSnapshot({
    client,
    tenantId: args.tenant,
    runId: args.run
  });
  const jobId = `${args.tenant}:${args.workflow}:${args.run}`;
  const job = await queue.getJob(jobId);
  const queueState = job ? await job.getState() : null;
  const summary = summarizeWorkflowRunVerification({
    snapshot,
    queue: {
      queueName: env.WF_WORKFLOW_QUEUE_NAME?.trim() || "wfpc-workflow-runs",
      jobId,
      state: queueState
    }
  });

  process.stdout.write(
    JSON.stringify(
      {
        ok: summary.ok,
        summary,
        snapshot,
        queue: {
          queueName: env.WF_WORKFLOW_QUEUE_NAME?.trim() || "wfpc-workflow-runs",
          jobId,
          state: queueState
        }
      },
      null,
      2
    ) + "\n"
  );
} finally {
  await queue.close();
  await connection.quit();
  await client.end();
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
