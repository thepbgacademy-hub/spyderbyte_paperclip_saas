import process from "node:process";

import { Queue } from "bullmq";
import { Redis } from "ioredis";

import { loadRuntimeEnv } from "../dist/api/runtime-server.js";
import { createDurableAuditSink } from "../dist/audit/durable-audit.js";
import { createAcidGuardRepository } from "../dist/db/acid-guard-repository.js";
import { createPgPool, createPgPoolQueryClient, createPgTransactionRunner } from "../dist/db/postgres-client.js";
import { createOperatorService } from "../dist/operators/operator-service.js";
import { createBullmqSafeJobId } from "../dist/workflows/bullmq-workflow-queue.js";

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.tenant || !args.actorUserId || !args.secretRef) {
    throw new Error("Missing required args: --tenant, --actor-user, --secret-ref");
  }

  const env = loadRuntimeEnv(process.env);
  const queueName = env.runtimeEnv.WF_WORKFLOW_QUEUE_NAME?.trim() || "wfpc-workflow-runs";
  const redisUrl = env.runtimeEnv.REDIS_URL;
  if (!redisUrl) {
    throw new Error("REDIS_URL is required");
  }

  const pool = createPgPool({
    connectionString: env.supabaseDbUrl,
    ...(env.supabaseDbSsl ? { sslMode: env.supabaseDbSsl } : {})
  });
  const queryClient = createPgPoolQueryClient(pool);
  const transactionRunner = createPgTransactionRunner(pool);
  const acidRepository = createAcidGuardRepository(transactionRunner);
  const audit = createDurableAuditSink(queryClient);
  const redis = new Redis(redisUrl, {
    maxRetriesPerRequest: null
  });
  const queue = new Queue(queueName, {
    connection: redis
  });

  try {
    const targets = await loadTargets({
      client: queryClient,
      tenantId: args.tenant,
      secretRef: args.secretRef
    });
    const operator = createOperatorService({
      isOperator: async (input) => isTenantOperator({ client: queryClient, tenantId: input.tenantId, userId: input.actorUserId }),
      tenantControls: {
        pause: async () => {},
        resume: async () => {},
        disablePaperclip: async () => {}
      },
      jobs: {
        inspect: async () => ({}),
        retry: async () => {},
        cancel: async ({ jobId }) => {
          const job = await queue.getJob(jobId);
          if (!job) {
            return;
          }
          await job.remove();
        },
        deadLetters: async () => []
      },
      runs: {
        cancelBySecretRef: (input) => acidRepository.cancelWorkflowRunsBySecretRef(input)
      },
      secrets: {
        rotate: async () => ({}),
        revoke: async () => ({})
      },
      audit: (event) => audit(event)
    });

    const removedJobs = [];
    const missingJobs = [];
    for (const target of targets) {
      if (!target.idempotencyKey) {
        missingJobs.push({ runId: target.runId, jobId: null });
        continue;
      }
      const jobId = createBullmqSafeJobId(target.idempotencyKey);
      const job = await queue.getJob(jobId);
      if (!job) {
        missingJobs.push({ runId: target.runId, jobId });
        continue;
      }
      await operator.cancelJob({
        tenantId: args.tenant,
        actorUserId: args.actorUserId,
        jobId
      });
      removedJobs.push({ runId: target.runId, jobId });
    }

    const cancelled = await operator.cancelRunsBySecretRef({
      tenantId: args.tenant,
      actorUserId: args.actorUserId,
      secretRef: args.secretRef
    });

    process.stdout.write(
      JSON.stringify(
        {
          ok: true,
          tenantId: args.tenant,
          secretRef: args.secretRef,
          discoveredRuns: targets.length,
          removedJobs,
          missingJobs,
          cancelled
        },
        null,
        2
      ) + "\n"
    );
  } finally {
    await queue.close();
    await redis.quit();
    await pool.end();
  }
}

await main();

function parseArgs(values) {
  const args = {
    tenant: undefined,
    actorUserId: undefined,
    secretRef: undefined
  };
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    const next = values[index + 1];
    if (typeof value !== "string" || !value.startsWith("--") || typeof next !== "string") {
      continue;
    }
    switch (value.slice(2)) {
      case "tenant":
        args.tenant = next;
        break;
      case "actor-user":
        args.actorUserId = next;
        break;
      case "secret-ref":
        args.secretRef = next;
        break;
      default:
        break;
    }
    index += 1;
  }
  return args;
}

async function isTenantOperator(input) {
  const result = await input.client.query(
    `select 1
       from wfpc.tenant_memberships
      where tenant_id = $1
        and user_id = $2
        and role in ('owner', 'admin', 'operator')
      limit 1`,
    [input.tenantId, input.userId]
  );
  return result.rows.length > 0;
}

async function loadTargets(input) {
  const result = await input.client.query(
    `select runs.id as run_id,
            runs.status,
            outbox.idempotency_key
       from wfpc.workflow_runs runs
       left join wfpc.workflow_queue_outbox outbox
         on outbox.tenant_id = runs.tenant_id
        and outbox.run_id = runs.id
      where runs.tenant_id = $1
        and exists (
          select 1
          from jsonb_array_elements(runs.bound_provider_context) entry
          where entry->>'secretRef' = $2
        )
        and runs.status in ('queued', 'running')
      order by runs.created_at asc`,
    [input.tenantId, input.secretRef]
  );
  return result.rows
    .map((row) => ({
      runId: String(row.run_id ?? ""),
      status: String(row.status ?? ""),
      idempotencyKey: typeof row.idempotency_key === "string" ? row.idempotency_key : ""
    }))
    .filter((row) => row.runId.length > 0);
}
