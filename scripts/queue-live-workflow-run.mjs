import process from "node:process";

import pg from "pg";

import { createLiveRunRequest, reserveLiveWorkflowRun } from "./lib/live-run-drive.mjs";
import { loadRuntimePreflight, summarizeRuntimePreflight } from "./lib/runtime-preflight.mjs";
import { loadScriptEnv } from "./lib/script-env.mjs";

const env = loadScriptEnv();

const args = parseArgs(process.argv.slice(2));
const required = ["tenant", "user", "workflow"];
const missing = required.filter((key) => !args[key]);
if (missing.length > 0) {
  throw new Error(`Missing required args: ${missing.map((key) => `--${key}`).join(", ")}`);
}

const request = createLiveRunRequest({
  tenantId: args.tenant,
  userId: args.user,
  workflowId: args.workflow,
  ...(args["workflow-template"] ? { workflowTemplateId: args["workflow-template"] } : {}),
  ...(args["fresh-run"] === "true" ? { skipExistingHarnessReuse: true } : {}),
  ...(args.run ? { runId: args.run } : {})
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
  const preflight = await loadRuntimePreflight({
    client,
    tenantId: request.tenantId,
    workflowId: request.workflowTemplateId ?? request.workflowId
  });
  const summary = summarizeRuntimePreflight(preflight);
  if (!summary.ok) {
    process.exitCode = 1;
    process.stdout.write(
      JSON.stringify(
        {
          ok: false,
          preflight,
          summary,
          request
        },
        null,
        2
      ) + "\n"
    );
  } else {
    await client.query("begin");

    const reservation = await reserveLiveWorkflowRun({ client, ...request });
    await client.query("commit");

    if (!reservation.reserved) {
      process.exitCode = 1;
    }

    process.stdout.write(
      JSON.stringify(
        {
          ok: reservation.reserved,
          result: reservation,
          request
        },
        null,
        2
      ) + "\n"
    );
  }
} catch (error) {
  await client.query("rollback");
  throw error;
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
