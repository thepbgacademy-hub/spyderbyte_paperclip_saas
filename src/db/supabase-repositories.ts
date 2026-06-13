import type { ProviderCapability } from "../packages/package-types.js";
import type { ProviderKind } from "../providers/provider-types.js";
import type { RuntimeProviderConnection } from "../providers/runtime-provider-resolution.js";
import type { TransactionRunner } from "./acid-guard-repository.js";

export type QueryClient = {
  query(sql: string, values: readonly unknown[]): Promise<{ rows: unknown[] }>;
};

export class TenantMembershipRequiredError extends Error {
  constructor() {
    super("Tenant membership is required");
    this.name = "TenantMembershipRequiredError";
  }
}

export class ActivePackageInstallRequiredError extends Error {
  constructor() {
    super("Active package install is required");
    this.name = "ActivePackageInstallRequiredError";
  }
}

export type CustomerSafePlatformLoad = {
  level: "light" | "moderate" | "heavy";
  summary: string;
  detail: string;
};

type DashboardScope = {
  tenantId: string;
  excludeRunId?: string;
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

function readOptionalTrimmedString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function toStorageConnectorPublicTarget(value: unknown): Record<string, string> {
  const record = asRecord(value);
  const folderLabel = readOptionalTrimmedString(record.folderLabel);
  const bucketLabel = readOptionalTrimmedString(record.bucketLabel);

  return {
    ...(folderLabel ? { folderLabel } : {}),
    ...(bucketLabel ? { bucketLabel } : {})
  };
}

export function createSupabaseRepositories(client: QueryClient) {
  return {
    async resolvePaperclipCompanyMapping(input: DashboardScope) {
      const result = await client.query(
        "select paperclip_company_id, paperclip_issue_agent_id from wfpc.paperclip_company_mappings where tenant_id = $1 limit 1",
        [input.tenantId]
      );
      const row = asRecord(result.rows[0]);
      const paperclipCompanyId = String(row.paperclip_company_id ?? "");
      if (!paperclipCompanyId) {
        throw new Error("Paperclip company mapping is required");
      }

      const paperclipIssueAgentId = readOptionalTrimmedString(row.paperclip_issue_agent_id);

      return {
        paperclipCompanyId,
        ...(paperclipIssueAgentId ? { paperclipIssueAgentId } : {})
      };
    },

    async hasActiveWorkflowRuns(input: DashboardScope): Promise<boolean> {
      return (await this.countActiveWorkflowRuns(input)) > 0;
    },

    async countActiveWorkflowRuns(input: DashboardScope): Promise<number> {
      const result = await client.query(
        `select count(*)::int as active_run_count
           from wfpc.workflow_runs
           where tenant_id = $1
             and status in ('queued', 'running')`,
        [input.tenantId]
      );
      return Number(asRecord(result.rows[0]).active_run_count ?? 0);
    },

    async countRunningWorkflowRuns(input: DashboardScope): Promise<number> {
      const result = await client.query(
        `select count(*)::int as running_run_count
           from wfpc.workflow_runs
           where tenant_id = $1
             and status = 'running'
             and ($2::text is null or id <> $2::text)`,
        [input.tenantId, input.excludeRunId ?? null]
      );
      return Number(asRecord(result.rows[0]).running_run_count ?? 0);
    },

    async requireTenantMember(input: MembershipScope): Promise<void> {
      const result = await client.query(
        "select tenant_id from wfpc.tenant_memberships where tenant_id = $1 and user_id = $2 limit 1",
        [input.tenantId, input.userId]
      );
      if (result.rows.length === 0) {
        throw new TenantMembershipRequiredError();
      }
    },

    async requireActivePackageInstall(input: DashboardScope & { packageId: string }): Promise<void> {
      const result = await client.query(
        `select installs.id
         from wfpc.tenant_package_installs installs
         join wfpc.tenant_package_purchases purchases
           on purchases.tenant_id = installs.tenant_id
          and purchases.package_id = installs.package_id
          and purchases.status = 'active'
          and purchases.starts_at <= now()
          and (purchases.ends_at is null or purchases.ends_at > now())
         where installs.tenant_id = $1
           and installs.package_id = $2
           and installs.status = 'active'
         limit 1`,
        [input.tenantId, input.packageId]
      );
      if (result.rows.length === 0) {
        throw new ActivePackageInstallRequiredError();
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

    async listActiveInstalledPackageIds(input: DashboardScope) {
      const result = await client.query(
        `select distinct installs.package_id
         from wfpc.tenant_package_installs installs
         join wfpc.tenant_package_purchases purchases
           on purchases.tenant_id = installs.tenant_id
          and purchases.package_id = installs.package_id
          and purchases.status = 'active'
          and purchases.starts_at <= now()
          and (purchases.ends_at is null or purchases.ends_at > now())
         where installs.tenant_id = $1
           and installs.status = 'active'
         order by installs.package_id`,
        [input.tenantId]
      );

      return result.rows
        .map((row) => readOptionalTrimmedString(asRecord(row).package_id))
        .filter((value): value is string => value !== undefined);
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

    async listRuntimeProviderConnections(input: DashboardScope & { workflowId: string }): Promise<readonly RuntimeProviderConnection[]> {
      const result = await client.query(
        `select workflows.tenant_id,
                workflows.provider_kind as workflow_provider_kind,
                secrets.provider_kind,
                secrets.label,
                secrets.secret_ref,
                secrets.metadata,
                req.capability
         from wfpc.workflow_templates workflows
         join wfpc.tenant_package_installs installs
           on installs.tenant_id = workflows.tenant_id
          and installs.package_id = workflows.package_id
          and installs.status = 'active'
         join wfpc.tenant_package_purchases purchases
           on purchases.tenant_id = installs.tenant_id
          and purchases.package_id = installs.package_id
          and purchases.status = 'active'
          and purchases.starts_at <= now()
          and (purchases.ends_at is null or purchases.ends_at > now())
         left join wfpc.package_provider_requirements req
           on req.package_id = workflows.package_id
          and (req.provider_kind is null or req.provider_kind = workflows.provider_kind)
         join wfpc.secret_references secrets
           on secrets.tenant_id = workflows.tenant_id
          and secrets.provider_kind = workflows.provider_kind
          and secrets.revoked_at is null
         where workflows.tenant_id = $1
           and workflows.id = $2
           and workflows.enabled = true
         order by secrets.provider_kind, secrets.label, req.capability`,
        [input.tenantId, input.workflowId]
      );

      const grouped = new Map<string, RuntimeProviderConnection & { normalizedCapabilities: ProviderCapability[] }>();
      const ambiguousKeys = new Set<string>();
      for (const row of result.rows.map(asRecord)) {
        const tenantId = String(row.tenant_id ?? "");
        const workflowProviderKind = String(row.workflow_provider_kind ?? "");
        const providerKind = String(row.provider_kind ?? "");
        const label = String(row.label ?? "");
        const secretRef = String(row.secret_ref ?? "");
        if (!tenantId || !workflowProviderKind || !providerKind || !label || !secretRef) {
          continue;
        }

        const key = `${tenantId}:${providerKind}:${label}:${secretRef}`;
        if (ambiguousKeys.has(key)) {
          continue;
        }

        const existing = grouped.get(key);
        const nextCapabilities = existing
          ? [...existing.normalizedCapabilities, normalizeProviderCapability(row.capability)].filter((value): value is ProviderCapability => value !== null)
          : [normalizeProviderCapability(row.capability)].filter((value): value is ProviderCapability => value !== null);
        const resolvedCapability = resolveRuntimeCapability({
          providerKind: workflowProviderKind,
          normalizedCapabilities: nextCapabilities
        });
        if (!resolvedCapability) {
          grouped.delete(key);
          ambiguousKeys.add(key);
          continue;
        }

        if (existing) {
          grouped.set(key, {
            ...existing,
            normalizedCapabilities: nextCapabilities,
            capabilities: [resolvedCapability]
          });
          continue;
        }

        grouped.set(key, {
          tenantId,
          providerKind: providerKind as RuntimeProviderConnection["providerKind"],
          label,
          secretRef,
          metadata: asObject(row.metadata),
          capabilities: [resolvedCapability],
          normalizedCapabilities: nextCapabilities
        });
      }

      return [...grouped.values()].map(({ normalizedCapabilities: _normalizedCapabilities, ...connection }) => connection);
    },

    async listStorageConnectors(input: DashboardScope) {
      const result = await client.query(
        `select id, provider_kind, display_name, public_target, revoked_at
         from wfpc.storage_connectors
         where tenant_id = $1 and revoked_at is null
         order by display_name`,
        [input.tenantId]
      );
      return result.rows
        .map(asRecord)
        .filter((record) => record.revoked_at === null)
        .map((record) => ({
          id: String(record.id),
          providerKind: String(record.provider_kind),
          displayName: String(record.display_name),
          connected: true,
          publicTarget: toStorageConnectorPublicTarget(record.public_target)
        }));
    },

    async getPlatformLoad(input: DashboardScope): Promise<CustomerSafePlatformLoad> {
      const counts = await client.query(
        `select
            (select count(*)::int
             from wfpc.workflow_queue_outbox
             where tenant_id = $1
               and status in ('pending', 'claimed', 'failed')) as pending_count,
            (select count(*)::int
             from wfpc.workflow_runs
             where tenant_id = $1
               and status in ('queued', 'running')) as active_count`,
        [input.tenantId]
      );

      const countRow = asRecord(counts.rows[0]);
      const pendingCount = Number(countRow.pending_count ?? 0);
      const activeCount = Number(countRow.active_count ?? 0);
      const pressureScore = pendingCount + activeCount;

      if (pressureScore >= 10) {
        return {
          level: "heavy",
          summary: "Heavy traffic",
          detail: "Workflows may take longer than usual to begin processing."
        };
      }

      if (pressureScore >= 4) {
        return {
          level: "moderate",
          summary: "Normal traffic",
          detail: "Slight delays are possible while current work clears."
        };
      }

      return {
        level: "light",
        summary: "Light traffic",
        detail: "New workflows should begin processing quickly."
      };
    },

    async createSecretReference(input: {
      tenantId: string;
      providerKind: string;
      label: string;
      secretRef: string;
      metadata: Record<string, unknown>;
      revokedAt: string | null;
    }): Promise<string> {
      await client.query(
        `update wfpc.secret_references
         set revoked_at = coalesce(revoked_at, now()),
             revoked_reason = 'superseded',
             updated_at = now()
         where tenant_id = $1
           and provider_kind = $2::wfpc.provider_kind
           and revoked_at is null`,
        [input.tenantId, input.providerKind]
      );
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
         set revoked_at = coalesce(revoked_at, now()),
             revoked_reason = coalesce(revoked_reason, 'manual'),
             updated_at = now()
         where tenant_id = $1 and secret_ref = $2
         returning id`,
        [input.tenantId, input.secretRef]
      );
      return String(asRecord(result.rows[0]).id);
    },

    async findSecretReferenceId(input: { tenantId: string; secretRef: string; runId?: string }): Promise<string> {
      const result = await client.query(
        `select secrets.id
         from wfpc.secret_references secrets
         left join wfpc.workflow_runs runs
           on runs.tenant_id = secrets.tenant_id
          and runs.id = $3::uuid
          and runs.bound_secret_reference_id = secrets.id
          and runs.status in ('queued', 'running')
         where secrets.tenant_id = $1
           and secrets.secret_ref = $2
           and (
             secrets.revoked_at is null
             or (
               runs.id is not null
               and secrets.revoked_reason = 'superseded'
             )
           )
         limit 1`,
        [input.tenantId, input.secretRef, input.runId ?? null]
      );
      const id = asRecord(result.rows[0]).id;
      return typeof id === "string" ? id : "";
    },

    async describeSecretReference(input: { tenantId: string; secretRef: string }): Promise<{ id: string; providerKind: ProviderKind } | null> {
      const result = await client.query(
        `select id, provider_kind
         from wfpc.secret_references
         where tenant_id = $1
           and secret_ref = $2
         limit 1`,
        [input.tenantId, input.secretRef]
      );
      const row = asRecord(result.rows[0]);
      if (typeof row.id !== "string" || typeof row.provider_kind !== "string") {
        return null;
      }
      return {
        id: row.id,
        providerKind: row.provider_kind as ProviderKind
      };
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

export function createSupabaseSecretRepository(client: QueryClient, runner?: TransactionRunner) {
  const repositories = createSupabaseRepositories(client);
  return {
    create: async (reference: Parameters<typeof repositories.createSecretReference>[0]) => {
      if (!runner) {
        return repositories.createSecretReference(reference);
      }
      return runner.withTransaction(async (transaction) => {
        const transactionalRepositories = createSupabaseRepositories(transaction);
        return transactionalRepositories.createSecretReference(reference);
      });
    },
    updateSecretRef: repositories.updateSecretRef,
    revoke: repositories.revokeSecretReference,
    findIdBySecretRef: repositories.findSecretReferenceId,
    describeSecretRef: repositories.describeSecretReference
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
    publicTarget: toStorageConnectorPublicTarget(row.public_target)
  };
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function normalizeProviderCapability(value: unknown): ProviderCapability | null {
  if (value === "content_generation") {
    return "text_generation";
  }

  return value === "text_generation" ||
    value === "image_generation" ||
    value === "video_generation" ||
    value === "social_publishing" ||
    value === "media_storage"
    ? value
    : null;
}

function inferCapabilityFromProviderKind(providerKind: string): ProviderCapability | null {
  return providerKind === "openai" ||
    providerKind === "openai_api" ||
    providerKind === "openai_chatgpt_codex_subscription" ||
    providerKind === "anthropic_api" ||
    providerKind === "xai_grok_api" ||
    providerKind === "openrouter_api" ||
    providerKind === "generic_api"
    ? "text_generation"
    : null;
}

function resolveRuntimeCapability(input: { providerKind: string; normalizedCapabilities: readonly ProviderCapability[] }): ProviderCapability | null {
  const uniqueCapabilities = [...new Set(input.normalizedCapabilities)];
  if (uniqueCapabilities.length === 1) {
    return uniqueCapabilities[0] ?? null;
  }

  if (uniqueCapabilities.length > 1) {
    return null;
  }

  return inferCapabilityFromProviderKind(input.providerKind);
}
