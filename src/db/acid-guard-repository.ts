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
           where i.tenant_id = $1
             and i.package_id = $2
             and i.status = 'active'
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

        return { reserved: true, runId: input.runId };
      });
    },

    async installPackage(input: { tenantId: string; packageId: string; userId: string }): Promise<PackageInstallResult> {
      return runner.withTransaction(async (transaction) => {
        const result = await transaction.query(
          `insert into wfpc.tenant_package_installs (tenant_id, package_id, installed_by_user_id, status)
           values ($1, $2, $3, 'active')
           on conflict (tenant_id, package_id) do update
           set status = 'active'
           returning id, status`,
          [input.tenantId, input.packageId, input.userId]
        );
        const row = asRecord(result.rows[0]);
        return { id: String(row.id), status: String(row.status) };
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
