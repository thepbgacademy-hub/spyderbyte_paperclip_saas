import type { RunStatus } from "../domain/types.js";
import type { QueryClient } from "../../db/supabase-repositories.js";

export interface FactoryRunRow {
  runId: string;
  tenantId: string;
  packageInstallId: string;
  packageId: string;
  packageVersionId: string;
  status: RunStatus;
  currentStationKey: "intake" | "positioning" | null;
  completedStationKey: "intake" | "positioning" | null;
  activeDeliverableId: string | null;
  activeApprovalId: string | null;
  activeApprovalContractKey: "original" | "revision_1" | null;
  positioningRevisionGeneration: 0 | 1;
  startedAt: string;
  completedAt: string | null;
}

export interface FactoryRunRepository {
  upsert(row: FactoryRunRow): Promise<void>;
  findByRunId(input: { tenantId: string; runId: string }): Promise<FactoryRunRow | null>;
}

function cloneRow(row: FactoryRunRow): FactoryRunRow {
  return { ...row };
}

/**
 * In-memory adapter mirroring deliverable-repository.ts /
 * run-approval-repository.ts; the durable Postgres adapter below is the
 * persistence path exercised by the run-driver integration/e2e tests.
 */
export function createInMemoryFactoryRunRepository(): FactoryRunRepository {
  const runs = new Map<string, FactoryRunRow>();
  const key = (tenantId: string, runId: string) => `${tenantId}:${runId}`;

  return {
    async upsert(row) {
      runs.set(key(row.tenantId, row.runId), cloneRow(row));
    },

    async findByRunId(input) {
      const found = runs.get(key(input.tenantId, input.runId));
      return found ? cloneRow(found) : null;
    }
  };
}

function toIsoString(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

function mapRow(row: Record<string, unknown>): FactoryRunRow {
  return {
    runId: String(row.run_id),
    tenantId: String(row.tenant_id),
    packageInstallId: String(row.package_install_id),
    packageId: String(row.package_id),
    packageVersionId: String(row.package_version_id),
    status: row.status as RunStatus,
    currentStationKey: (row.current_station_key as "intake" | "positioning" | null) ?? null,
    completedStationKey: (row.completed_station_key as "intake" | "positioning" | null) ?? null,
    activeDeliverableId: (row.active_deliverable_id as string | null) ?? null,
    activeApprovalId: (row.active_approval_id as string | null) ?? null,
    activeApprovalContractKey: (row.active_approval_contract_key as "original" | "revision_1" | null) ?? null,
    positioningRevisionGeneration: Number(row.positioning_revision_generation) === 1 ? 1 : 0,
    startedAt: toIsoString(row.started_at),
    completedAt: row.completed_at ? toIsoString(row.completed_at) : null
  };
}

/**
 * Backs FactoryRunRepository with migration 0040's wfpc.factory_runs table.
 * Tenant isolation is app-layer: every read/write is scoped by
 * `tenant_id = $1` in the WHERE clause, not Postgres RLS (TASK-084 AC5) --
 * the same load-bearing pattern as deliverable-repository.ts /
 * run-approval-repository.ts.
 */
export function createPostgresFactoryRunRepository(client: QueryClient): FactoryRunRepository {
  return {
    async upsert(row) {
      await client.query(
        `insert into wfpc.factory_runs
          (run_id, tenant_id, package_install_id, package_id, package_version_id, status,
           current_station_key, completed_station_key, active_deliverable_id, active_approval_id,
           active_approval_contract_key, positioning_revision_generation, started_at, completed_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
         on conflict (tenant_id, run_id) do update set
           status = excluded.status,
           current_station_key = excluded.current_station_key,
           completed_station_key = excluded.completed_station_key,
           active_deliverable_id = excluded.active_deliverable_id,
           active_approval_id = excluded.active_approval_id,
           active_approval_contract_key = excluded.active_approval_contract_key,
           positioning_revision_generation = excluded.positioning_revision_generation,
           completed_at = excluded.completed_at,
           updated_at = now()`,
        [
          row.runId,
          row.tenantId,
          row.packageInstallId,
          row.packageId,
          row.packageVersionId,
          row.status,
          row.currentStationKey,
          row.completedStationKey,
          row.activeDeliverableId,
          row.activeApprovalId,
          row.activeApprovalContractKey,
          row.positioningRevisionGeneration,
          row.startedAt,
          row.completedAt
        ]
      );
    },

    async findByRunId(input) {
      const result = await client.query(
        `select run_id, tenant_id, package_install_id, package_id, package_version_id, status,
                current_station_key, completed_station_key, active_deliverable_id, active_approval_id,
                active_approval_contract_key, positioning_revision_generation, started_at, completed_at
         from wfpc.factory_runs
         where tenant_id = $1 and run_id = $2`,
        [input.tenantId, input.runId]
      );
      const row = result.rows[0] as Record<string, unknown> | undefined;
      return row ? mapRow(row) : null;
    }
  };
}
