import type { Approval, ApprovalStatus } from "../domain/types.js";
import type { QueryClient } from "../../db/supabase-repositories.js";

export type FactoryRunApprovalContractKey = "original" | "revision_1";

export interface FactoryRunApprovalRow {
  approvalId: string;
  tenantId: string;
  runId: string;
  packageId: string;
  packageVersionId: string;
  packageInstallId: string;
  stationKey: Approval["stationKey"];
  deliverableId: string;
  contractKey: FactoryRunApprovalContractKey;
  status: ApprovalStatus;
  requestedAt: string;
  resolvedAt: string | null;
  resolutionSummary: string | null;
}

export interface FactoryRunApprovalRepository {
  createPendingApproval(input: {
    row: FactoryRunApprovalRow;
  }): Promise<void>;
  findPendingApprovalForRun(input: {
    tenantId: string;
    runId: string;
  }): Promise<FactoryRunApprovalRow | null>;
  findApprovedApprovalForRun(input: {
    tenantId: string;
    runId: string;
  }): Promise<FactoryRunApprovalRow | null>;
  applyDecision(input: {
    tenantId: string;
    approvalId: string;
    status: Extract<ApprovalStatus, "approved" | "changes_requested">;
    resolvedAt: string;
    resolutionSummary: string | null;
  }): Promise<FactoryRunApprovalRow | null>;
}

function cloneRow(row: FactoryRunApprovalRow): FactoryRunApprovalRow {
  return { ...row };
}

export function createInMemoryFactoryRunApprovalRepository(): FactoryRunApprovalRepository {
  const approvals = new Map<string, FactoryRunApprovalRow>();

  return {
    async createPendingApproval(input) {
      const { row } = input;
      if (row.status !== "pending") {
        throw new Error(`Approval "${row.approvalId}" must be created as pending`);
      }
      if (approvals.has(row.approvalId)) {
        throw new Error(`Approval "${row.approvalId}" already exists`);
      }
      const existingPendingForRun = [...approvals.values()].find(
        (candidate) =>
          candidate.tenantId === row.tenantId && candidate.runId === row.runId && candidate.status === "pending"
      );
      if (existingPendingForRun) {
        throw new Error(`Run "${row.runId}" already has a pending approval`);
      }
      approvals.set(row.approvalId, cloneRow(row));
    },

    async findPendingApprovalForRun(input) {
      const found = [...approvals.values()].find(
        (candidate) =>
          candidate.tenantId === input.tenantId && candidate.runId === input.runId && candidate.status === "pending"
      );
      return found ? cloneRow(found) : null;
    },

    async findApprovedApprovalForRun(input) {
      const found = [...approvals.values()]
        .filter(
          (candidate) =>
            candidate.tenantId === input.tenantId && candidate.runId === input.runId && candidate.status === "approved"
        )
        .sort((a, b) => (b.resolvedAt ?? "").localeCompare(a.resolvedAt ?? ""))[0];
      return found ? cloneRow(found) : null;
    },

    async applyDecision(input) {
      const existing = approvals.get(input.approvalId);
      if (!existing || existing.tenantId !== input.tenantId || existing.status !== "pending") {
        return null;
      }
      const updated: FactoryRunApprovalRow = {
        ...existing,
        status: input.status,
        resolvedAt: input.resolvedAt,
        resolutionSummary: input.resolutionSummary
      };
      approvals.set(input.approvalId, updated);
      return cloneRow(updated);
    }
  };
}

function toIsoString(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

function mapRow(row: Record<string, unknown>): FactoryRunApprovalRow {
  return {
    approvalId: String(row.approval_id),
    tenantId: String(row.tenant_id),
    runId: String(row.run_id),
    packageId: String(row.package_id),
    packageVersionId: String(row.package_version_id),
    packageInstallId: String(row.package_install_id),
    stationKey: row.station_key as Approval["stationKey"],
    deliverableId: String(row.deliverable_id),
    contractKey: row.contract_key as FactoryRunApprovalContractKey,
    status: row.approval_status as ApprovalStatus,
    requestedAt: toIsoString(row.requested_at),
    resolvedAt: row.resolved_at ? toIsoString(row.resolved_at) : null,
    resolutionSummary: (row.resolution_summary as string | null) ?? null
  };
}

/**
 * Backs FactoryRunApprovalRepository with migration 0039's
 * wfpc.factory_run_approvals table. Tenant isolation is app-layer: every
 * read/write is scoped by `tenant_id = $1` in the WHERE clause, not Postgres
 * RLS (TASK-076 AC3) -- the same load-bearing pattern as
 * package-install-repository.ts / deliverable-repository.ts.
 */
export function createPostgresFactoryRunApprovalRepository(client: QueryClient): FactoryRunApprovalRepository {
  return {
    async createPendingApproval(input) {
      const { row } = input;
      if (row.status !== "pending") {
        throw new Error(`Approval "${row.approvalId}" must be created as pending`);
      }

      await client.query(
        `insert into wfpc.factory_run_approvals
          (approval_id, tenant_id, run_id, package_id, package_version_id, package_install_id,
           station_key, deliverable_id, contract_key, approval_status, requested_at, resolved_at, resolution_summary)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,'pending',$10,null,null)`,
        [
          row.approvalId,
          row.tenantId,
          row.runId,
          row.packageId,
          row.packageVersionId,
          row.packageInstallId,
          row.stationKey,
          row.deliverableId,
          row.contractKey,
          row.requestedAt
        ]
      );
    },

    async findPendingApprovalForRun(input) {
      const result = await client.query(
        `select approval_id, tenant_id, run_id, package_id, package_version_id, package_install_id,
                station_key, deliverable_id, contract_key, approval_status, requested_at, resolved_at, resolution_summary
         from wfpc.factory_run_approvals
         where tenant_id = $1 and run_id = $2 and approval_status = 'pending'
         limit 1`,
        [input.tenantId, input.runId]
      );
      const row = result.rows[0] as Record<string, unknown> | undefined;
      return row ? mapRow(row) : null;
    },

    async findApprovedApprovalForRun(input) {
      const result = await client.query(
        `select approval_id, tenant_id, run_id, package_id, package_version_id, package_install_id,
                station_key, deliverable_id, contract_key, approval_status, requested_at, resolved_at, resolution_summary
         from wfpc.factory_run_approvals
         where tenant_id = $1 and run_id = $2 and approval_status = 'approved'
         order by resolved_at desc
         limit 1`,
        [input.tenantId, input.runId]
      );
      const row = result.rows[0] as Record<string, unknown> | undefined;
      return row ? mapRow(row) : null;
    },

    async applyDecision(input): Promise<FactoryRunApprovalRow | null> {
      const result = await client.query(
        `update wfpc.factory_run_approvals
         set approval_status = $4,
             resolved_at = $5,
             resolution_summary = $6,
             updated_at = now()
         where tenant_id = $1 and approval_id = $2 and approval_status = $3
         returning approval_id, tenant_id, run_id, package_id, package_version_id, package_install_id,
                   station_key, deliverable_id, contract_key, approval_status, requested_at, resolved_at, resolution_summary`,
        [input.tenantId, input.approvalId, "pending", input.status, input.resolvedAt, input.resolutionSummary]
      );
      const row = result.rows[0] as Record<string, unknown> | undefined;
      return row ? mapRow(row) : null;
    }
  };
}
