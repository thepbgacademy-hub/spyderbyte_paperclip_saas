import process from "node:process";

import pg from "pg";

import { createLiveRunRequest } from "./lib/live-run-drive.mjs";
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
    workflowId: request.workflowId
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

    const reservation = await reserveWorkflowRun({ client, ...request });
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

async function reserveWorkflowRun(input) {
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
    `select id
     from wfpc.package_provider_requirements
     where package_id = $1
       and (provider_kind is null or provider_kind = $2)
     limit 1`,
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
          capability: String(workflowRow.provider_kind),
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
