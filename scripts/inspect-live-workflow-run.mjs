import process from "node:process";

import pg from "pg";

import { loadWorkflowRunSnapshot, summarizeWorkflowRunVerification } from "./lib/live-run-drive.mjs";
import { inspectQueueState } from "./lib/queue-inspection.mjs";
import { loadScriptEnv } from "./lib/script-env.mjs";

const env = loadScriptEnv();

const args = parseArgs(process.argv.slice(2));
if (!args.tenant || !args.run || !args.workflow) {
  throw new Error("Missing required args: --tenant, --workflow, --run");
}

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
  const snapshot = await loadWorkflowRunSnapshot({
    client,
    tenantId: args.tenant,
    runId: args.run
  });
  const jobId = `${args.tenant}:${args.workflow}:${args.run}`;
  const queueInspection = await inspectQueueState({
    redisUrl: env.REDIS_URL,
    queueName: env.WF_WORKFLOW_QUEUE_NAME?.trim() || "wfpc-workflow-runs",
    jobId
  });
  const summary = summarizeWorkflowRunVerification({
    snapshot,
    queue: queueInspection
  });

  process.stdout.write(
    JSON.stringify(
      {
        ok: summary.ok,
        summary,
        snapshot,
        queue: queueInspection
      },
      null,
      2
    ) + "\n"
  );
} finally {
  closing = true;
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
