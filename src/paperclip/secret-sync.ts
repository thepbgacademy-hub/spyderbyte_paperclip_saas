import type { ProviderKind } from "../providers/provider-types.js";
import type { QueryClient } from "../db/supabase-repositories.js";

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export type PaperclipSecretBindingRecord = {
  tenantId: string;
  wealthFactorySecretReferenceId: string;
  paperclipCompanyId: string;
  paperclipAgentId: string;
  paperclipEnvKey: string;
  paperclipSecretId: string;
  paperclipSecretKey: string;
  providerKind: ProviderKind;
  bindingStatus: "active" | "revoked" | "error";
  lastSyncedAt: string;
  lastError: string | null;
};

export type PaperclipSecretAdminClient = {
  upsertSecret(input: {
    companyId: string;
    secretKey: string;
    secretValue: string;
  }): Promise<{ paperclipSecretId: string; paperclipSecretKey: string }>;
  bindAgentSecretRef(input: {
    companyId: string;
    agentId: string;
    envKey: string;
    paperclipSecretId: string;
  }): Promise<void>;
  revokeSecretBinding?(input: {
    companyId: string;
    agentId: string;
    envKey: string;
    paperclipSecretId: string;
  }): Promise<void>;
};

export type PaperclipSecretProjectionService = {
  onRegistered(input: {
    tenantId: string;
    secretReferenceId: string;
    providerKind: ProviderKind;
    secretRef: string;
    secretValues: Record<string, string>;
  }): Promise<void>;
  onRotated(input: {
    tenantId: string;
    secretReferenceId: string;
    providerKind: ProviderKind;
    allowBootstrap?: boolean;
    previousSecretRef: string;
    nextSecretRef: string;
    nextSecretValues: Record<string, string>;
  }): Promise<void>;
  revokeBySecretRef(input: { tenantId: string; secretRef: string }): Promise<void>;
};

export function createPaperclipSecretBindingRepository(client: QueryClient) {
  return {
    async upsert(input: Omit<PaperclipSecretBindingRecord, "lastSyncedAt">): Promise<void> {
      await client.query(
        `insert into wfpc.paperclip_secret_bindings
          (tenant_id, wealth_factory_secret_reference_id, paperclip_company_id, paperclip_agent_id, paperclip_env_key, paperclip_secret_id, paperclip_secret_key, provider_kind, binding_status, last_synced_at, last_error)
         values ($1, $2::uuid, $3, $4, $5, $6, $7, $8::wfpc.provider_kind, $9, now(), $10)
         on conflict (wealth_factory_secret_reference_id, paperclip_company_id, paperclip_agent_id, paperclip_env_key)
         do update set
           paperclip_secret_id = excluded.paperclip_secret_id,
           paperclip_secret_key = excluded.paperclip_secret_key,
           provider_kind = excluded.provider_kind,
           binding_status = excluded.binding_status,
           last_synced_at = now(),
           last_error = excluded.last_error,
           updated_at = now()`,
        [
          input.tenantId,
          input.wealthFactorySecretReferenceId,
          input.paperclipCompanyId,
          input.paperclipAgentId,
          input.paperclipEnvKey,
          input.paperclipSecretId,
          input.paperclipSecretKey,
          input.providerKind,
          input.bindingStatus,
          input.lastError
        ]
      );
    },

    async revoke(input: { tenantId: string; wealthFactorySecretReferenceId: string }): Promise<void> {
      await client.query(
        `update wfpc.paperclip_secret_bindings
         set binding_status = 'revoked',
             updated_at = now()
         where tenant_id = $1
           and wealth_factory_secret_reference_id = $2::uuid`,
        [input.tenantId, input.wealthFactorySecretReferenceId]
      );
    },

    async listBindingsBySecretReference(input: { tenantId: string; wealthFactorySecretReferenceId: string }): Promise<readonly PaperclipSecretBindingRecord[]> {
      const result = await client.query(
        `select tenant_id,
                wealth_factory_secret_reference_id,
                paperclip_company_id,
                paperclip_agent_id,
                paperclip_env_key,
                paperclip_secret_id,
                paperclip_secret_key,
                provider_kind,
                binding_status,
                last_synced_at,
                last_error
         from wfpc.paperclip_secret_bindings
         where tenant_id = $1
           and wealth_factory_secret_reference_id = $2::uuid`,
        [input.tenantId, input.wealthFactorySecretReferenceId]
      );
      return result.rows.map((row) => {
        const record = asRecord(row);
        return {
          tenantId: String(record.tenant_id),
          wealthFactorySecretReferenceId: String(record.wealth_factory_secret_reference_id),
          paperclipCompanyId: String(record.paperclip_company_id),
          paperclipAgentId: String(record.paperclip_agent_id),
          paperclipEnvKey: String(record.paperclip_env_key),
          paperclipSecretId: String(record.paperclip_secret_id),
          paperclipSecretKey: String(record.paperclip_secret_key),
          providerKind: String(record.provider_kind) as ProviderKind,
          bindingStatus: String(record.binding_status) as PaperclipSecretBindingRecord["bindingStatus"],
          lastSyncedAt: String(record.last_synced_at),
          lastError: typeof record.last_error === "string" ? record.last_error : null
        };
      });
    },

    async findActiveBySecretRef(input: {
      tenantId: string;
      paperclipCompanyId: string;
      paperclipAgentId?: string;
      paperclipEnvKey?: string;
      secretRef: string;
    }): Promise<PaperclipSecretBindingRecord | null> {
      const result = await client.query(
        `select bindings.tenant_id,
                bindings.wealth_factory_secret_reference_id,
                bindings.paperclip_company_id,
                bindings.paperclip_agent_id,
                bindings.paperclip_env_key,
                bindings.paperclip_secret_id,
                bindings.paperclip_secret_key,
                bindings.provider_kind,
                bindings.binding_status,
                bindings.last_synced_at,
                bindings.last_error
         from wfpc.paperclip_secret_bindings bindings
         join wfpc.secret_references secrets
           on secrets.id = bindings.wealth_factory_secret_reference_id
         where bindings.tenant_id = $1
           and bindings.paperclip_company_id = $2
           and bindings.binding_status = 'active'
           and ($4::text is null or bindings.paperclip_agent_id = $4)
           and ($5::text is null or bindings.paperclip_env_key = $5)
           and secrets.secret_ref = $3
         limit 1`,
        [input.tenantId, input.paperclipCompanyId, input.secretRef, input.paperclipAgentId ?? null, input.paperclipEnvKey ?? null]
      );
      const row = asRecord(result.rows[0]);
      if (!row.tenant_id) {
        return null;
      }
      return {
        tenantId: String(row.tenant_id),
        wealthFactorySecretReferenceId: String(row.wealth_factory_secret_reference_id),
        paperclipCompanyId: String(row.paperclip_company_id),
        paperclipAgentId: String(row.paperclip_agent_id),
        paperclipEnvKey: String(row.paperclip_env_key),
        paperclipSecretId: String(row.paperclip_secret_id),
        paperclipSecretKey: String(row.paperclip_secret_key),
        providerKind: String(row.provider_kind) as ProviderKind,
        bindingStatus: String(row.binding_status) as PaperclipSecretBindingRecord["bindingStatus"],
        lastSyncedAt: String(row.last_synced_at),
        lastError: typeof row.last_error === "string" ? row.last_error : null
      };
    }
  };
}

export function createPaperclipSecretSyncService(options: {
  adminClient: PaperclipSecretAdminClient;
  bindings: ReturnType<typeof createPaperclipSecretBindingRepository>;
}) {
  return {
    async syncBinding(input: {
      tenantId: string;
      wealthFactorySecretReferenceId: string;
      paperclipCompanyId: string;
      paperclipAgentId: string;
      paperclipEnvKey: string;
      providerKind: ProviderKind;
      secretValue: string;
      paperclipSecretKey: string;
    }): Promise<void> {
      try {
        const secret = await options.adminClient.upsertSecret({
          companyId: input.paperclipCompanyId,
          secretKey: input.paperclipSecretKey,
          secretValue: input.secretValue
        });
        await options.adminClient.bindAgentSecretRef({
          companyId: input.paperclipCompanyId,
          agentId: input.paperclipAgentId,
          envKey: input.paperclipEnvKey,
          paperclipSecretId: secret.paperclipSecretId
        });
        await options.bindings.upsert({
          tenantId: input.tenantId,
          wealthFactorySecretReferenceId: input.wealthFactorySecretReferenceId,
          paperclipCompanyId: input.paperclipCompanyId,
          paperclipAgentId: input.paperclipAgentId,
          paperclipEnvKey: input.paperclipEnvKey,
          paperclipSecretId: secret.paperclipSecretId,
          paperclipSecretKey: secret.paperclipSecretKey,
          providerKind: input.providerKind,
          bindingStatus: "active",
          lastError: null
        });
      } catch (error) {
        await options.bindings.upsert({
          tenantId: input.tenantId,
          wealthFactorySecretReferenceId: input.wealthFactorySecretReferenceId,
          paperclipCompanyId: input.paperclipCompanyId,
          paperclipAgentId: input.paperclipAgentId,
          paperclipEnvKey: input.paperclipEnvKey,
          paperclipSecretId: "",
          paperclipSecretKey: input.paperclipSecretKey,
          providerKind: input.providerKind,
          bindingStatus: "error",
          lastError: error instanceof Error ? error.message : "paperclip_secret_sync_failed"
        });
        throw error;
      }
    },

    async revokeBinding(input: { tenantId: string; wealthFactorySecretReferenceId: string }): Promise<void> {
      const bindings = await options.bindings.listBindingsBySecretReference(input);
      if (options.adminClient.revokeSecretBinding) {
        for (const binding of bindings) {
          if (binding.bindingStatus !== "active") {
            continue;
          }
          await options.adminClient.revokeSecretBinding({
            companyId: binding.paperclipCompanyId,
            agentId: binding.paperclipAgentId,
            envKey: binding.paperclipEnvKey,
            paperclipSecretId: binding.paperclipSecretId
          });
        }
      }
      await options.bindings.revoke(input);
    }
  };
}

export function createPaperclipSecretProjectionService(options: {
  adminClient: PaperclipSecretAdminClient;
  bindings: ReturnType<typeof createPaperclipSecretBindingRepository>;
  resolveCompanyMapping(input: { tenantId: string }): Promise<{ paperclipCompanyId: string }>;
  paperclipAgentId: string;
  audit?(event: {
    tenantId: string;
    eventType: string;
    entityType: string;
    entityId?: string;
    metadata: Record<string, unknown>;
  }): Promise<void> | void;
}) : PaperclipSecretProjectionService {
  const syncService = createPaperclipSecretSyncService(options);

  return {
    async onRegistered(input) {
      const company = await resolveCompanyMappingSafely(options, {
        tenantId: input.tenantId,
        eventType: "paperclip.secret_projection_skipped",
        entityId: input.secretReferenceId,
        metadata: {
          lifecycle: "register",
          providerKind: input.providerKind
        }
      });
      if (!company) {
        return;
      }
      for (const binding of toPaperclipEnvBindings(input.providerKind, input.secretValues)) {
        await syncService.syncBinding({
          tenantId: input.tenantId,
          wealthFactorySecretReferenceId: input.secretReferenceId,
          paperclipCompanyId: company.paperclipCompanyId,
          paperclipAgentId: options.paperclipAgentId,
          paperclipEnvKey: binding.envKey,
          providerKind: input.providerKind,
          secretValue: binding.secretValue,
          paperclipSecretKey: binding.envKey
        });
      }
    },

    async onRotated(input) {
      const company = await resolveCompanyMappingSafely(options, {
        tenantId: input.tenantId,
        eventType: "paperclip.secret_projection_skipped",
        entityId: input.secretReferenceId,
        metadata: {
          lifecycle: "rotate",
          providerKind: input.providerKind
        }
      });
      if (!company) {
        return;
      }
      const existingBindings = await options.bindings.listBindingsBySecretReference({
        tenantId: input.tenantId,
        wealthFactorySecretReferenceId: input.secretReferenceId
      });
      if (existingBindings.length === 0) {
        if (!input.allowBootstrap) {
          return;
        }
        for (const binding of toPaperclipEnvBindings(input.providerKind, input.nextSecretValues)) {
          await syncService.syncBinding({
            tenantId: input.tenantId,
            wealthFactorySecretReferenceId: input.secretReferenceId,
            paperclipCompanyId: company.paperclipCompanyId,
            paperclipAgentId: options.paperclipAgentId,
            paperclipEnvKey: binding.envKey,
            providerKind: input.providerKind,
            secretValue: binding.secretValue,
            paperclipSecretKey: binding.envKey
          });
        }
        return;
      }
      for (const existing of existingBindings) {
        const secretValue = toPaperclipSecretValue(existing.paperclipEnvKey, input.nextSecretValues);
        await syncService.syncBinding({
          tenantId: input.tenantId,
          wealthFactorySecretReferenceId: input.secretReferenceId,
          paperclipCompanyId: company.paperclipCompanyId,
          paperclipAgentId: existing.paperclipAgentId,
          paperclipEnvKey: existing.paperclipEnvKey,
          providerKind: existing.providerKind,
          secretValue,
          paperclipSecretKey: existing.paperclipSecretKey
        });
      }
    },

    async revokeBySecretRef(input) {
      const company = await resolveCompanyMappingSafely(options, {
        tenantId: input.tenantId,
        eventType: "paperclip.secret_projection_skipped",
        entityId: input.secretRef,
        metadata: {
          lifecycle: "revoke"
        }
      });
      if (!company) {
        return;
      }
      const binding = await options.bindings.findActiveBySecretRef({
        tenantId: input.tenantId,
        paperclipCompanyId: company.paperclipCompanyId,
        secretRef: input.secretRef
      });
      if (!binding) {
        return;
      }
      await syncService.revokeBinding({
        tenantId: input.tenantId,
        wealthFactorySecretReferenceId: binding.wealthFactorySecretReferenceId
      });
    }
  };
}

async function resolveCompanyMappingSafely(
  options: Pick<Parameters<typeof createPaperclipSecretProjectionService>[0], "resolveCompanyMapping" | "audit">,
  input: {
    tenantId: string;
    eventType: string;
    entityId?: string;
    metadata: Record<string, unknown>;
  }
): Promise<{ paperclipCompanyId: string } | null> {
  try {
    return await options.resolveCompanyMapping({ tenantId: input.tenantId });
  } catch (error) {
    await options.audit?.({
      tenantId: input.tenantId,
      eventType: input.eventType,
      entityType: "paperclip_secret_projection",
      ...(input.entityId ? { entityId: input.entityId } : {}),
      metadata: {
        ...input.metadata,
        error: error instanceof Error ? error.message : "paperclip_company_mapping_unavailable"
      }
    });
    return null;
  }
}

export function createPaperclipSecretAdminHttpClient(options: {
  baseUrl: string;
  adminToken: string;
  fetchImpl?: FetchLike;
}): PaperclipSecretAdminClient {
  const baseUrl = options.baseUrl.replace(/\/+$/, "");
  const fetchImpl = options.fetchImpl ?? fetch;

  return {
    async upsertSecret(input) {
      const body = await requestJson(fetchImpl, `${baseUrl}/api/admin/companies/${encodeURIComponent(input.companyId)}/secrets`, {
        method: "POST",
        headers: createHeaders(options.adminToken),
        body: JSON.stringify({
          key: input.secretKey,
          value: input.secretValue
        })
      });
      const record = asRecord(body);
      const paperclipSecretId = typeof record.id === "string" ? record.id : typeof record.secretId === "string" ? record.secretId : "";
      if (!paperclipSecretId) {
        throw new Error("Paperclip secret upsert did not return a secret id");
      }
      return {
        paperclipSecretId,
        paperclipSecretKey: typeof record.key === "string" ? record.key : input.secretKey
      };
    },

    async bindAgentSecretRef(input) {
      await requestJson(
        fetchImpl,
        `${baseUrl}/api/admin/companies/${encodeURIComponent(input.companyId)}/agents/${encodeURIComponent(input.agentId)}/env/${encodeURIComponent(input.envKey)}`,
        {
          method: "PUT",
          headers: createHeaders(options.adminToken),
          body: JSON.stringify({
            type: "secret_ref",
            secretId: input.paperclipSecretId,
            version: "latest"
          })
        }
      );
    },

    async revokeSecretBinding(input) {
      await requestJson(
        fetchImpl,
        `${baseUrl}/api/admin/companies/${encodeURIComponent(input.companyId)}/agents/${encodeURIComponent(input.agentId)}/env/${encodeURIComponent(input.envKey)}`,
        {
          method: "DELETE",
          headers: createHeaders(options.adminToken),
          body: JSON.stringify({
            secretId: input.paperclipSecretId
          })
        }
      );
    }
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

export function toPaperclipEnvBindings(
  providerKind: ProviderKind,
  secretValues: Record<string, string>
): readonly { envKey: string; secretValue: string }[] {
  switch (providerKind) {
    case "openai":
    case "openai_api":
      return [{ envKey: "OPENAI_API_KEY", secretValue: requireSecretValue(secretValues, "apiKey") }];
    case "anthropic_api":
      return [{ envKey: "ANTHROPIC_API_KEY", secretValue: requireSecretValue(secretValues, "apiKey") }];
    case "xai_grok_api":
      return [{ envKey: "XAI_API_KEY", secretValue: requireSecretValue(secretValues, "apiKey") }];
    case "openrouter_api":
      return [{ envKey: "OPENROUTER_API_KEY", secretValue: requireSecretValue(secretValues, "apiKey") }];
    default:
      throw new Error(`Unsupported Paperclip secret binding provider: ${providerKind}`);
  }
}

function toPaperclipSecretValue(envKey: string, secretValues: Record<string, string>): string {
  switch (envKey) {
    case "OPENAI_API_KEY":
    case "ANTHROPIC_API_KEY":
    case "XAI_API_KEY":
    case "OPENROUTER_API_KEY":
      return requireSecretValue(secretValues, "apiKey");
    default:
      throw new Error(`Unsupported Paperclip env assignment: ${envKey}`);
  }
}

function requireSecretValue(secretValues: Record<string, string>, key: string): string {
  const value = secretValues[key];
  if (!value) {
    throw new Error(`Missing provider secret value: ${key}`);
  }
  return value;
}

function createHeaders(token: string): HeadersInit {
  return {
    authorization: `Bearer ${token}`,
    "content-type": "application/json"
  };
}

async function requestJson(fetchImpl: FetchLike, url: string, init: RequestInit): Promise<unknown> {
  const response = await fetchImpl(url, init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Paperclip secret admin request failed: ${response.status}`);
  }
  return body;
}
