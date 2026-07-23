import type { QueryClient } from "../../db/supabase-repositories.js";

export interface FactoryRunDeliverableRow {
  deliverableId: string;
  tenantId: string;
  runId: string;
  packageInstallId: string;
  stationKey: string;
  kind: string;
  title: string;
  body: Record<string, unknown>;
}

export interface FactoryRunDeliverableRepository {
  save(row: FactoryRunDeliverableRow): Promise<void>;
  findById(input: { tenantId: string; deliverableId: string }): Promise<FactoryRunDeliverableRow | null>;
}

/**
 * Backs station deliverable persistence for the TASK-055 walking skeleton
 * (migration 0038_factory_run_deliverables.sql). Tenant isolation is
 * app-layer: every read is scoped by `tenant_id = $1`, not Postgres RLS
 * (TASK-055 AC3) -- deliberately the same load-bearing pattern as
 * package-install-repository.ts's createPostgresFactoryPackageInstallRepository.
 */
export function createPostgresFactoryRunDeliverableRepository(client: QueryClient): FactoryRunDeliverableRepository {
  return {
    async save(row) {
      await client.query(
        `insert into wfpc.factory_run_deliverables
          (deliverable_id, tenant_id, run_id, package_install_id, station_key, kind, title, body)
         values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)
         on conflict (deliverable_id) do update set
           title = excluded.title,
           body = excluded.body,
           updated_at = now()`,
        [
          row.deliverableId,
          row.tenantId,
          row.runId,
          row.packageInstallId,
          row.stationKey,
          row.kind,
          row.title,
          JSON.stringify(row.body)
        ]
      );
    },

    async findById(input) {
      const result = await client.query(
        `select deliverable_id, tenant_id, run_id, package_install_id, station_key, kind, title, body
         from wfpc.factory_run_deliverables
         where tenant_id = $1 and deliverable_id = $2`,
        [input.tenantId, input.deliverableId]
      );
      const row = result.rows[0] as Record<string, unknown> | undefined;
      if (!row) {
        return null;
      }
      return {
        deliverableId: String(row.deliverable_id),
        tenantId: String(row.tenant_id),
        runId: String(row.run_id),
        packageInstallId: String(row.package_install_id),
        stationKey: String(row.station_key),
        kind: String(row.kind),
        title: String(row.title),
        body: row.body as Record<string, unknown>
      };
    }
  };
}
