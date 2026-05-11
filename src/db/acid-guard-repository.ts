import type { QueryClient } from "./supabase-repositories.js";

export type TransactionRunner = {
  withTransaction<T>(callback: (transaction: QueryClient) => Promise<T>): Promise<T>;
};

export type ReserveWorkflowRunInput = {
  tenantId: string;
  userId: string;
  workflowTemplateId: string;
  runId: string;
  idempotencyKey: string;
};

export type ReserveWorkflowRunResult =
  | { reserved: true; runId: string }
  | {
      reserved: false;
      reason: "tenant_paused" | "tenant_not_found" | "not_member" | "workflow_unavailable" | "entitlement_denied" | "credential_revoked" | "duplicate";
    };

export type PackageInstallResult = {
  id: string;
  status: string;
};

export type PackageInstallDecision =
  | { installed: true; id: string; status: string }
  | { installed: false; reason: "package_not_purchased" };

export type QueueOutboxRecord = {
  id: string;
  tenantId: string;
  runId: string;
  workflowTemplateId: string;
  userId: string;
  idempotencyKey: string;
  attempts: number;
  claimToken: string;
};

export function createAcidGuardRepository(runner: TransactionRunner) {
  return {
    async reserveWorkflowRun(input: ReserveWorkflowRunInput): Promise<ReserveWorkflowRunResult> {
      return runner.withTransaction(async (transaction) => {
        const tenant = await transaction.query("select paused_at from wfpc.tenants where id = $1 for update", [input.tenantId]);
        if (tenant.rows.length === 0) {
          return { reserved: false, reason: "tenant_not_found" };
        }

        const tenantRow = asRecord(tenant.rows[0]);
        if (tenantRow.paused_at !== null) {
          return { reserved: false, reason: "tenant_paused" };
        }

        const membership = await transaction.query("select tenant_id from wfpc.tenant_memberships where tenant_id = $1 and user_id = $2", [
          input.tenantId,
          input.userId
        ]);
        if (membership.rows.length === 0) {
          return { reserved: false, reason: "not_member" };
        }

        const workflow = await transaction.query(
          "select id, package_id, provider_kind from wfpc.workflow_templates where tenant_id = $1 and id = $2 and enabled = true for update",
          [input.tenantId, input.workflowTemplateId]
        );
        if (workflow.rows.length === 0) {
          return { reserved: false, reason: "workflow_unavailable" };
        }

        const workflowRow = asRecord(workflow.rows[0]);
        if (workflowRow.package_id === null || workflowRow.package_id === undefined) {
          return { reserved: false, reason: "entitlement_denied" };
        }

        const install = await transaction.query(
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

        const providerRequirement = await transaction.query(
          `select id
           from wfpc.package_provider_requirements
           where package_id = $1
             and (provider_kind is null or provider_kind = $2)
           limit 1`,
          [workflowRow.package_id, workflowRow.provider_kind]
        );
        if (providerRequirement.rows.length === 0) {
          return { reserved: false, reason: "entitlement_denied" };
        }

        const credential = await transaction.query(
          "select id from wfpc.secret_references where tenant_id = $1 and provider_kind = $2 and revoked_at is null limit 1 for update",
          [input.tenantId, workflowRow.provider_kind]
        );
        if (credential.rows.length === 0) {
          return { reserved: false, reason: "credential_revoked" };
        }

        const reservation = await transaction.query(
          `insert into wfpc.workflow_run_reservations
            (tenant_id, workflow_template_id, run_id, idempotency_key, reserved_by_user_id)
           values ($1, $2, $3, $4, $5)
           on conflict do nothing
           returning id`,
          [input.tenantId, input.workflowTemplateId, input.runId, input.idempotencyKey, input.userId]
        );
        if (reservation.rows.length === 0) {
          return { reserved: false, reason: "duplicate" };
        }

        await transaction.query(
          `insert into wfpc.workflow_runs
            (id, tenant_id, workflow_template_id, created_by_user_id, status)
           values ($1, $2, $3, $4, 'queued')`,
          [input.runId, input.tenantId, input.workflowTemplateId, input.userId]
        );

        await transaction.query(
          `insert into wfpc.workflow_queue_outbox
            (tenant_id, run_id, workflow_template_id, created_by_user_id, idempotency_key)
           values ($1, $2, $3, $4, $5)
           on conflict (tenant_id, run_id) do nothing`,
          [input.tenantId, input.runId, input.workflowTemplateId, input.userId, input.idempotencyKey]
        );

        return { reserved: true, runId: input.runId };
      });
    },

    async markWorkflowRunQueued(input: { tenantId: string; runId: string; outboxId: string; claimToken: string }): Promise<{ marked: boolean }> {
      return runner.withTransaction(async (transaction) => {
        const result = await transaction.query(
          `update wfpc.workflow_queue_outbox
           set status = 'enqueued',
               enqueued_at = coalesce(enqueued_at, now()),
               claim_token = null,
               updated_at = now(),
               last_error = null
           where tenant_id = $1
             and run_id = $2
             and id = $3::uuid
             and claim_token = $4::uuid
             and status = 'claimed'
           returning id`,
          [input.tenantId, input.runId, input.outboxId, input.claimToken]
        );
        return { marked: result.rows.length > 0 };
      });
    },

    async claimWorkflowQueueOutbox(input: { limit: number; staleClaimSeconds?: number }): Promise<QueueOutboxRecord[]> {
      return runner.withTransaction(async (transaction) => {
        const result = await transaction.query(
          `with next_jobs as (
             select id
             from wfpc.workflow_queue_outbox
             where (
                status in ('pending', 'failed')
                and available_at <= now()
             )
                or (
                  status = 'claimed'
                  and claimed_at < now() - ($2::int * interval '1 second')
                )
             order by available_at, created_at
             limit $1
             for update skip locked
           )
           update wfpc.workflow_queue_outbox outbox
           set status = 'claimed',
               claim_token = gen_random_uuid(),
               claimed_at = now(),
               attempts = attempts + 1,
               updated_at = now()
           from next_jobs
           where outbox.id = next_jobs.id
           returning outbox.id, outbox.tenant_id, outbox.run_id, outbox.workflow_template_id, outbox.created_by_user_id, outbox.idempotency_key, outbox.attempts, outbox.claim_token`,
          [input.limit, input.staleClaimSeconds ?? 300]
        );
        return result.rows.map((row) => {
          const record = asRecord(row);
          return {
            id: String(record.id),
            tenantId: String(record.tenant_id),
            runId: String(record.run_id),
            workflowTemplateId: String(record.workflow_template_id),
            userId: String(record.created_by_user_id),
            idempotencyKey: String(record.idempotency_key),
            attempts: Number(record.attempts),
            claimToken: String(record.claim_token)
          };
        });
      });
    },

    async releaseWorkflowQueueOutbox(input: { outboxId: string; claimToken: string; error: string; retryAfterSeconds: number }): Promise<{ released: boolean }> {
      return runner.withTransaction(async (transaction) => {
        const result = await transaction.query(
          `update wfpc.workflow_queue_outbox
           set status = 'failed',
               claim_token = null,
               available_at = now() + ($2::int * interval '1 second'),
               last_error = left($3, 500),
               updated_at = now()
           where id = $1
             and claim_token = $4::uuid
             and status = 'claimed'
           returning id`,
          [input.outboxId, input.retryAfterSeconds, input.error, input.claimToken]
        );
        return { released: result.rows.length > 0 };
      });
    },

    async installPackage(input: { tenantId: string; packageId: string; userId: string }): Promise<PackageInstallDecision> {
      return runner.withTransaction(async (transaction) => {
        const membership = await transaction.query(
          `select tenant_id
           from wfpc.tenant_memberships
           where tenant_id = $1
             and user_id = $2
             and role in ('owner', 'admin')
           limit 1`,
          [input.tenantId, input.userId]
        );
        if (membership.rows.length === 0) {
          return { installed: false, reason: "package_not_purchased" };
        }

        const purchase = await transaction.query(
          `select id
           from wfpc.tenant_package_purchases
           where tenant_id = $1
             and package_id = $2
             and status = 'active'
             and starts_at <= now()
             and (ends_at is null or ends_at > now())
           limit 1
           for update`,
          [input.tenantId, input.packageId]
        );
        if (purchase.rows.length === 0) {
          return { installed: false, reason: "package_not_purchased" };
        }

        const result = await transaction.query(
          `insert into wfpc.tenant_package_installs (tenant_id, package_id, installed_by_user_id, status)
           values ($1, $2, $3, 'active')
           on conflict (tenant_id, package_id) do update
           set status = 'active'
           returning id, status`,
          [input.tenantId, input.packageId, input.userId]
        );
        const row = asRecord(result.rows[0]);
        return { installed: true, id: String(row.id), status: String(row.status) };
      });
    },

    async revokeCredential(input: { tenantId: string; secretReferenceId: string }): Promise<{ revoked: boolean }> {
      return runner.withTransaction(async (transaction) => {
        const result = await transaction.query(
          `update wfpc.secret_references
           set revoked_at = coalesce(revoked_at, now())
           where tenant_id = $1 and id = $2 and revoked_at is null
           returning id`,
          [input.tenantId, input.secretReferenceId]
        );
        return { revoked: result.rows.length > 0 };
      });
    },

    async transitionWorkflowRunStatus(input: {
      tenantId: string;
      runId: string;
      from: readonly string[];
      to: string;
    }): Promise<{ transitioned: boolean; status?: string }> {
      return runner.withTransaction(async (transaction) => {
        const result = await transaction.query(
          `update wfpc.workflow_runs
           set status = $4, updated_at = now()
           where tenant_id = $1
             and id = $2
             and status = any($3::wfpc.workflow_run_status[])
           returning id, status`,
          [input.tenantId, input.runId, input.from, input.to]
        );
        if (result.rows.length === 0) {
          return { transitioned: false };
        }

        const row = asRecord(result.rows[0]);
        return { transitioned: true, status: String(row.status) };
      });
    }
  };
}

function asRecord(row: unknown): Record<string, unknown> {
  return row && typeof row === "object" ? (row as Record<string, unknown>) : {};
}
