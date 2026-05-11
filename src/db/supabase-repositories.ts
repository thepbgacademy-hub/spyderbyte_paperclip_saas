import type { TransactionRunner } from "./acid-guard-repository.js";

export type QueryClient = {
  query(sql: string, values: readonly unknown[]): Promise<{ rows: unknown[] }>;
};

type DashboardScope = {
  tenantId: string;
};

type MembershipScope = DashboardScope & {
  userId: string;
};

function asRecord(row: unknown): Record<string, unknown> {
  if (!row || typeof row !== "object") {
    return {};
  }
  return row as Record<string, unknown>;
}

export function createSupabaseRepositories(client: QueryClient) {
  return {
    async requireTenantMember(input: MembershipScope): Promise<void> {
      const result = await client.query(
        "select tenant_id from wfpc.tenant_memberships where tenant_id = $1 and user_id = $2 limit 1",
        [input.tenantId, input.userId]
      );
      if (result.rows.length === 0) {
        throw new Error("Tenant membership is required");
      }
    },

    async listWorkflows(input: DashboardScope) {
      const result = await client.query(
        "select id, name, provider_kind, enabled from wfpc.workflow_templates where tenant_id = $1 and enabled = true order by name",
        [input.tenantId]
      );
      return result.rows.map((row) => {
        const record = asRecord(row);
        return {
          id: String(record.id),
          name: String(record.name),
          providerKind: String(record.provider_kind),
          enabled: Boolean(record.enabled)
        };
      });
    },

    async listPackages(input: DashboardScope) {
      const result = await client.query(
        `select p.id, p.name, p.kind, i.status
         from wfpc.tenant_package_installs i
         join wfpc.wealth_factory_packages p on p.id = i.package_id
         where i.tenant_id = $1
         order by p.name`,
        [input.tenantId]
      );
      return result.rows.map((row) => {
        const record = asRecord(row);
        return {
          id: String(record.id),
          name: String(record.name),
          kind: String(record.kind),
          status: String(record.status)
        };
      });
    },

    async listArtifacts(input: DashboardScope) {
      const result = await client.query(
        `select id, filename, artifact_type, expires_at
         from wfpc.artifact_metadata
         where tenant_id = $1 and purged_at is null
         order by expires_at desc`,
        [input.tenantId]
      );
      return result.rows.map((row) => {
        const record = asRecord(row);
        return {
          id: String(record.id),
          filename: String(record.filename),
          artifactType: String(record.artifact_type),
          expiresAt: String(record.expires_at)
        };
      });
    },

    async listProviderConnections(input: DashboardScope) {
      const result = await client.query(
        `select provider_kind, label, revoked_at
         from wfpc.secret_references
         where tenant_id = $1 and revoked_at is null
         order by provider_kind, label`,
        [input.tenantId]
      );
      return result.rows
        .map(asRecord)
        .filter((record) => record.revoked_at === null)
        .map((record) => ({
          providerKind: String(record.provider_kind),
          label: String(record.label),
          connected: true
        }));
    },

    async createSecretReference(input: {
      tenantId: string;
      providerKind: string;
      label: string;
      secretRef: string;
      metadata: Record<string, unknown>;
      revokedAt: string | null;
    }): Promise<string> {
      const result = await client.query(
        `insert into wfpc.secret_references
          (tenant_id, provider_kind, label, secret_ref, metadata, revoked_at)
         values ($1, $2::wfpc.provider_kind, $3, $4, $5::jsonb, $6)
         returning id`,
        [input.tenantId, input.providerKind, input.label, input.secretRef, JSON.stringify(input.metadata), input.revokedAt]
      );
      return String(asRecord(result.rows[0]).id);
    },

    async updateSecretRef(input: { tenantId: string; previousSecretRef: string; nextSecretRef: string }): Promise<string> {
      const result = await client.query(
        `update wfpc.secret_references
         set secret_ref = $3, updated_at = now()
         where tenant_id = $1 and secret_ref = $2 and revoked_at is null
         returning id`,
        [input.tenantId, input.previousSecretRef, input.nextSecretRef]
      );
      return String(asRecord(result.rows[0]).id);
    },

    async revokeSecretReference(input: { tenantId: string; secretRef: string }): Promise<string> {
      const result = await client.query(
        `update wfpc.secret_references
         set revoked_at = coalesce(revoked_at, now()), updated_at = now()
         where tenant_id = $1 and secret_ref = $2
         returning id`,
        [input.tenantId, input.secretRef]
      );
      return String(asRecord(result.rows[0]).id);
    },

    async findSecretReferenceId(input: { tenantId: string; secretRef: string }): Promise<string> {
      const result = await client.query("select id from wfpc.secret_references where tenant_id = $1 and secret_ref = $2 and revoked_at is null limit 1", [
        input.tenantId,
        input.secretRef
      ]);
      const id = asRecord(result.rows[0]).id;
      return typeof id === "string" ? id : "";
    },

    async registerStorageConnector(input: {
      tenantId: string;
      actorUserId: string;
      providerKind: string;
      displayName: string;
      secretRefs: Record<string, string>;
      publicTarget: Record<string, unknown>;
    }) {
      return registerStorageConnectorRecord(client, input);
    }
  };
}

export function createSupabaseSecretRepository(client: QueryClient) {
  const repositories = createSupabaseRepositories(client);
  return {
    create: repositories.createSecretReference,
    updateSecretRef: repositories.updateSecretRef,
    revoke: repositories.revokeSecretReference,
    findIdBySecretRef: repositories.findSecretReferenceId
  };
}

export function createSupabaseStorageConnectorRepository(runner: TransactionRunner) {
  return {
    async register(input: {
      tenantId: string;
      actorUserId: string;
      providerKind: string;
      displayName: string;
      secretRefs: Record<string, string>;
      publicTarget: Record<string, unknown>;
    }) {
      return runner.withTransaction(async (transaction) => registerStorageConnectorRecord(transaction, input));
    }
  };
}

export async function registerStorageConnectorRecord(
  client: QueryClient,
  input: {
    tenantId: string;
    actorUserId: string;
    providerKind: string;
    displayName: string;
    secretRefs: Record<string, string>;
    publicTarget: Record<string, unknown>;
  }
) {
  const connector = await client.query(
    `insert into wfpc.storage_connectors
      (tenant_id, provider_kind, display_name, public_target)
     values ($1, $2, $3, $4::jsonb)
     returning id, provider_kind, display_name, public_target`,
    [input.tenantId, input.providerKind, input.displayName, JSON.stringify(input.publicTarget)]
  );
  const row = asRecord(connector.rows[0]);
  await client.query(
    `insert into wfpc_private.storage_connector_secrets
      (storage_connector_id, tenant_id, provider_kind, secret_refs)
     values ($1, $2, $3, $4::jsonb)
     on conflict (storage_connector_id) do update
     set secret_refs = excluded.secret_refs,
         updated_at = now()`,
    [String(row.id), input.tenantId, input.providerKind, JSON.stringify(input.secretRefs)]
  );
  return {
    id: String(row.id),
    providerKind: String(row.provider_kind),
    displayName: String(row.display_name),
    connected: true,
    publicTarget: asRecord(row.public_target)
  };
}
