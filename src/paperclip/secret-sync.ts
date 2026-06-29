import type { ProviderKind } from "../providers/provider-types.js";
import type { QueryClient } from "../db/supabase-repositories.js";

// Legacy-bounded adapter: retained only for Paperclip secret projection compatibility.
// Active Wealth Factory runtime execution does not route workflow runs through this module.
type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export type PaperclipSecretBindingRecord = {
  tenantId: string;
  wealthFactorySecretReferenceId: string;
  paperclipCompanyId: string;
  paperclipAgentId: string;
  paperclipEnvKey: string;
  paperclipSecretId: string;
  paperclipSecretKey: string;
  paperclipSecretVersion?: string;
  providerKind: ProviderKind;
  bindingStatus: "active" | "synced" | "revoked" | "error";
  lastSyncedAt: string;
  lastError: string | null;
};

export type PaperclipSecretBoardSessionClient = {
  upsertSecret(input: {
    companyId: string;
    secretKey: string;
    secretValue: string;
  }): Promise<{ paperclipSecretId: string; paperclipSecretKey: string; paperclipSecretVersion: string }>;
  bindAgentSecretRef(input: {
    companyId: string;
    agentId: string;
    envKey: string;
    paperclipSecretId: string;
    paperclipSecretVersion?: string;
    }): Promise<void>;
  revokeSecretBinding?(input: {
    companyId: string;
    agentId: string;
    envKey: string;
    paperclipSecretId: string;
  }): Promise<void>;
};

/**
 * @deprecated Preserve compatibility for existing composition sites while the
 * repo migrates to explicit board-session naming.
 */
export type PaperclipSecretAdminClient = PaperclipSecretBoardSessionClient;

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
          (tenant_id, wealth_factory_secret_reference_id, paperclip_company_id, paperclip_agent_id, paperclip_env_key, paperclip_secret_id, paperclip_secret_key, paperclip_secret_version, provider_kind, binding_status, last_synced_at, last_error)
         values ($1, $2::uuid, $3, $4, $5, $6, $7, $8, $9::wfpc.provider_kind, $10, now(), $11)
         on conflict (wealth_factory_secret_reference_id, paperclip_company_id, paperclip_agent_id, paperclip_env_key)
         do update set
           paperclip_secret_id = excluded.paperclip_secret_id,
           paperclip_secret_key = excluded.paperclip_secret_key,
           paperclip_secret_version = excluded.paperclip_secret_version,
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
          input.paperclipSecretVersion ?? null,
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
                paperclip_secret_version,
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
          ...(typeof record.paperclip_secret_version === "string" ? { paperclipSecretVersion: record.paperclip_secret_version } : {}),
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
                bindings.paperclip_secret_version,
                bindings.provider_kind,
                bindings.binding_status,
                bindings.last_synced_at,
                bindings.last_error
         from wfpc.paperclip_secret_bindings bindings
         join wfpc.secret_references secrets
           on secrets.id = bindings.wealth_factory_secret_reference_id
         where bindings.tenant_id = $1
           and bindings.paperclip_company_id = $2
           and bindings.binding_status in ('active', 'synced')
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
        ...(typeof row.paperclip_secret_version === "string" ? { paperclipSecretVersion: row.paperclip_secret_version } : {}),
        providerKind: String(row.provider_kind) as ProviderKind,
        bindingStatus: String(row.binding_status) as PaperclipSecretBindingRecord["bindingStatus"],
        lastSyncedAt: String(row.last_synced_at),
        lastError: typeof row.last_error === "string" ? row.last_error : null
      };
    }
  };
}

export function createPaperclipSecretSyncService(options: {
  adminClient: PaperclipSecretBoardSessionClient;
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
      bindToAgent?: boolean;
      }): Promise<{ paperclipSecretId: string; paperclipSecretKey: string; paperclipSecretVersion: string }> {
      try {
        const secret = await options.adminClient.upsertSecret({
          companyId: input.paperclipCompanyId,
          secretKey: input.paperclipSecretKey,
          secretValue: input.secretValue
        });
        if (input.bindToAgent ?? true) {
          await options.adminClient.bindAgentSecretRef({
            companyId: input.paperclipCompanyId,
            agentId: input.paperclipAgentId,
            envKey: input.paperclipEnvKey,
            paperclipSecretId: secret.paperclipSecretId,
            paperclipSecretVersion: secret.paperclipSecretVersion
          });
        }
        await options.bindings.upsert({
          tenantId: input.tenantId,
          wealthFactorySecretReferenceId: input.wealthFactorySecretReferenceId,
          paperclipCompanyId: input.paperclipCompanyId,
          paperclipAgentId: input.paperclipAgentId,
          paperclipEnvKey: input.paperclipEnvKey,
          paperclipSecretId: secret.paperclipSecretId,
          paperclipSecretKey: secret.paperclipSecretKey,
          paperclipSecretVersion: secret.paperclipSecretVersion,
          providerKind: input.providerKind,
          bindingStatus: input.bindToAgent ?? true ? "active" : "synced",
          lastError: null
        });
        return secret;
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
  adminClient: PaperclipSecretBoardSessionClient;
  bindings: ReturnType<typeof createPaperclipSecretBindingRepository>;
  resolveCompanyMapping(input: { tenantId: string }): Promise<{ paperclipCompanyId: string; paperclipIssueAgentId?: string }>;
  hasActiveRuns?(input: { tenantId: string }): Promise<boolean>;
  defaultPaperclipAgentId?: string;
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
      const paperclipAgentId = company.paperclipIssueAgentId ?? options.defaultPaperclipAgentId;
      if (!paperclipAgentId) {
        throw new Error("Paperclip issue agent mapping is required");
      }
      for (const binding of toPaperclipEnvBindings(input.providerKind, input.secretValues)) {
        await syncService.syncBinding({
          tenantId: input.tenantId,
          wealthFactorySecretReferenceId: input.secretReferenceId,
          paperclipCompanyId: company.paperclipCompanyId,
          paperclipAgentId,
          paperclipEnvKey: binding.envKey,
          providerKind: input.providerKind,
          secretValue: binding.secretValue,
          paperclipSecretKey: binding.envKey,
          bindToAgent: false
        });
      }
    },

    async onRotated(input) {
      if (await options.hasActiveRuns?.({ tenantId: input.tenantId })) {
        await options.audit?.({
          tenantId: input.tenantId,
          eventType: "paperclip.secret_projection_deferred",
          entityType: "paperclip_secret_projection",
          entityId: input.secretReferenceId,
          metadata: {
            lifecycle: "rotate",
            providerKind: input.providerKind,
            reason: "active_runs_present"
          }
        });
        return;
      }
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
      const paperclipAgentId = company.paperclipIssueAgentId ?? options.defaultPaperclipAgentId;
      if (!paperclipAgentId) {
        throw new Error("Paperclip issue agent mapping is required");
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
            paperclipAgentId,
            paperclipEnvKey: binding.envKey,
            providerKind: input.providerKind,
            secretValue: binding.secretValue,
            paperclipSecretKey: binding.envKey,
            bindToAgent: false
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
          paperclipSecretKey: existing.paperclipSecretKey,
          bindToAgent: false
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
): Promise<{ paperclipCompanyId: string; paperclipIssueAgentId?: string } | null> {
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
  origin?: string;
  referer?: string;
  fetchImpl?: FetchLike;
}): PaperclipSecretAdminClient {
  return createPaperclipSecretBoardSessionHttpClient({
    baseUrl: options.baseUrl,
    boardSessionCookie: options.adminToken,
    ...(options.origin ? { origin: options.origin } : {}),
    ...(options.referer ? { referer: options.referer } : {}),
    ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {})
  });
}

export function createPaperclipSecretBoardSessionHttpClient(options: {
  baseUrl: string;
  boardSessionCookie: string;
  origin?: string;
  referer?: string;
  fetchImpl?: FetchLike;
}): PaperclipSecretBoardSessionClient {
  const baseUrl = options.baseUrl.replace(/\/+$/, "");
  const fetchImpl = options.fetchImpl ?? fetch;
  const requestHeaders = createBoardSessionHeaders({
    cookie: options.boardSessionCookie,
    origin: options.origin ?? deriveOrigin(baseUrl),
    referer: options.referer ?? `${deriveOrigin(baseUrl)}/`
  });

  return {
    async upsertSecret(input) {
      const normalizedSecretKey = normalizePaperclipSecretKey(input.secretKey);
      const existingSecret = await findCompanySecretByKey(fetchImpl, baseUrl, requestHeaders, {
        companyId: input.companyId,
        secretKey: normalizedSecretKey,
        secretName: input.secretKey
      });
      const record = existingSecret
        ? await rotateOrRecoverCompanySecret(fetchImpl, baseUrl, requestHeaders, {
            paperclipSecretId: existingSecret.paperclipSecretId,
            secretValue: input.secretValue,
            ...(existingSecret.paperclipSecretStatus ? { existingStatus: existingSecret.paperclipSecretStatus } : {})
          })
        : await createOrRecoverCompanySecret(fetchImpl, baseUrl, requestHeaders, {
            companyId: input.companyId,
            secretKey: normalizedSecretKey,
            secretName: input.secretKey,
            secretValue: input.secretValue
          });
      const parsed = asRecord(record);
      const paperclipSecretId =
        typeof parsed.id === "string"
          ? parsed.id
          : typeof parsed.secretId === "string"
            ? parsed.secretId
            : existingSecret?.paperclipSecretId ?? "";
      if (!paperclipSecretId) {
        throw new Error("Paperclip board-session secret upsert did not return a secret id");
      }
      return {
          paperclipSecretId,
          paperclipSecretVersion: readPaperclipSecretVersion(parsed, existingSecret?.paperclipSecretVersion),
          paperclipSecretKey: typeof parsed.key === "string" ? parsed.key : existingSecret?.paperclipSecretKey ?? normalizedSecretKey
        };
    },

    async bindAgentSecretRef(input) {
      const agent = await requestJson(fetchImpl, `${baseUrl}/api/agents/${encodeURIComponent(input.agentId)}`, {
        method: "GET",
        headers: requestHeaders
      });
      const adapterConfig = readAgentAdapterConfig(agent);
      const env = readAdapterEnv(adapterConfig);
      await requestJson(
        fetchImpl,
        `${baseUrl}/api/agents/${encodeURIComponent(input.agentId)}`,
        {
          method: "PATCH",
          headers: requestHeaders,
          body: JSON.stringify({
            replaceAdapterConfig: true,
            adapterConfig: {
              ...adapterConfig,
              env: {
                ...env,
                [input.envKey]: {
                  type: "secret_ref",
                  secretId: input.paperclipSecretId,
                  version: toPaperclipVersionSelector(input.paperclipSecretVersion)
                }
              }
            }
          })
        }
      );
    },

    async revokeSecretBinding(input) {
      const agent = await requestJson(fetchImpl, `${baseUrl}/api/agents/${encodeURIComponent(input.agentId)}`, {
        method: "GET",
        headers: requestHeaders
      });
      const adapterConfig = readAgentAdapterConfig(agent);
      const env = readAdapterEnv(adapterConfig);
      const nextEnv = { ...env };
      const currentValue = asRecord(nextEnv[input.envKey]);
      if (typeof currentValue.secretId === "string" && currentValue.secretId === input.paperclipSecretId) {
        delete nextEnv[input.envKey];
        await requestJson(fetchImpl, `${baseUrl}/api/agents/${encodeURIComponent(input.agentId)}`, {
          method: "PATCH",
          headers: requestHeaders,
          body: JSON.stringify({
            replaceAdapterConfig: true,
            adapterConfig: {
              ...adapterConfig,
              env: nextEnv
            }
          })
        });
      }
      await requestJson(
        fetchImpl,
        `${baseUrl}/api/secrets/${encodeURIComponent(input.paperclipSecretId)}`,
        {
          method: "PATCH",
          headers: requestHeaders,
          body: JSON.stringify({
            status: "disabled"
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

export function toPaperclipSecretRefBinding(input: {
  paperclipSecretId: string;
  paperclipSecretVersion?: string;
}): { type: "secret_ref"; secretId: string; version: string | number } {
  return {
    type: "secret_ref",
    secretId: input.paperclipSecretId,
    version: toPaperclipVersionSelector(input.paperclipSecretVersion)
  };
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

function createBoardSessionHeaders(input: {
  cookie: string;
  origin: string;
  referer: string;
}): HeadersInit {
  return {
    cookie: normalizeBoardSessionCookie(input.cookie),
    "content-type": "application/json",
    origin: input.origin,
    referer: input.referer
  };
}

function normalizeBoardSessionCookie(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return trimmed;
  }
  if (trimmed.includes("=")) {
    return trimmed;
  }
  return `paperclip-default.session_token=${trimmed}`;
}

async function requestJson(fetchImpl: FetchLike, url: string, init: RequestInit): Promise<unknown> {
  const response = await fetchImpl(url, init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new PaperclipBoardSessionHttpError(response.status, body);
  }
  return body;
}

async function rotateCompanySecret(
  fetchImpl: FetchLike,
  baseUrl: string,
  headers: HeadersInit,
  input: { paperclipSecretId: string; secretValue: string }
): Promise<unknown> {
  return requestJson(fetchImpl, `${baseUrl}/api/secrets/${encodeURIComponent(input.paperclipSecretId)}/rotate`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      value: input.secretValue
    })
  });
}

async function rotateOrRecoverCompanySecret(
  fetchImpl: FetchLike,
  baseUrl: string,
  headers: HeadersInit,
  input: { paperclipSecretId: string; secretValue: string; existingStatus?: string }
): Promise<unknown> {
  if (input.existingStatus === "disabled") {
    await setCompanySecretStatus(fetchImpl, baseUrl, headers, {
      paperclipSecretId: input.paperclipSecretId,
      status: "active"
    });
  }

  try {
    return await rotateCompanySecret(fetchImpl, baseUrl, headers, {
      paperclipSecretId: input.paperclipSecretId,
      secretValue: input.secretValue
    });
  } catch (error) {
    if (!(error instanceof PaperclipBoardSessionHttpError) || error.status !== 422 || input.existingStatus === "disabled") {
      throw error;
    }
    await setCompanySecretStatus(fetchImpl, baseUrl, headers, {
      paperclipSecretId: input.paperclipSecretId,
      status: "active"
    });
    return rotateCompanySecret(fetchImpl, baseUrl, headers, {
      paperclipSecretId: input.paperclipSecretId,
      secretValue: input.secretValue
    });
  }
}

async function createOrRecoverCompanySecret(
  fetchImpl: FetchLike,
  baseUrl: string,
  headers: HeadersInit,
  input: { companyId: string; secretKey: string; secretName: string; secretValue: string }
): Promise<unknown> {
  try {
    return await requestJson(fetchImpl, `${baseUrl}/api/companies/${encodeURIComponent(input.companyId)}/secrets`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        name: input.secretName,
        key: input.secretKey,
        value: input.secretValue
      })
    });
  } catch (error) {
    if (!(error instanceof PaperclipBoardSessionHttpError) || error.status !== 409) {
      throw error;
    }
    const recoveredSecret = await findCompanySecretByKey(fetchImpl, baseUrl, headers, {
      companyId: input.companyId,
      secretKey: input.secretKey,
      secretName: input.secretName
    });
    if (!recoveredSecret) {
      throw error;
    }
    return rotateOrRecoverCompanySecret(fetchImpl, baseUrl, headers, {
      paperclipSecretId: recoveredSecret.paperclipSecretId,
      secretValue: input.secretValue,
      ...(recoveredSecret.paperclipSecretStatus ? { existingStatus: recoveredSecret.paperclipSecretStatus } : {})
    });
  }
}

async function findCompanySecretByKey(
  fetchImpl: FetchLike,
  baseUrl: string,
  headers: HeadersInit,
  input: { companyId: string; secretKey: string; secretName?: string }
): Promise<{ paperclipSecretId: string; paperclipSecretKey: string; paperclipSecretVersion?: string; paperclipSecretStatus?: string } | null> {
  const body = await requestJson(fetchImpl, `${baseUrl}/api/companies/${encodeURIComponent(input.companyId)}/secrets`, {
    method: "GET",
    headers
  });
  const records = extractSecretRecords(body);
  const normalizedSecretKey = normalizePaperclipSecretKey(input.secretKey);
  const normalizedSecretName = input.secretName ? normalizePaperclipSecretKey(input.secretName) : null;
  const matches = records.filter((record) => {
    const keyMatch = normalizePaperclipSecretKey(record.paperclipSecretKey) === normalizedSecretKey;
    if (keyMatch) {
      return true;
    }
    return normalizedSecretName !== null && normalizePaperclipSecretKey(record.paperclipSecretName ?? "") === normalizedSecretName;
  });
  const activeMatch = matches.find((record) => record.paperclipSecretStatus !== "disabled");
  return activeMatch ?? matches[0] ?? null;
}

function extractSecretRecords(body: unknown): Array<{ paperclipSecretId: string; paperclipSecretKey: string; paperclipSecretVersion?: string; paperclipSecretStatus?: string; paperclipSecretName?: string }> {
  const record = asRecord(body);
  const candidates = Array.isArray(body)
    ? body
    : Array.isArray(record.secrets)
      ? record.secrets
      : Array.isArray(record.items)
        ? record.items
        : [];
  return candidates
    .map((candidate) => {
      const value = asRecord(candidate);
      const paperclipSecretId =
        typeof value.id === "string" ? value.id : typeof value.secretId === "string" ? value.secretId : "";
      const paperclipSecretKey =
        typeof value.key === "string" ? value.key : typeof value.secretKey === "string" ? value.secretKey : "";
      const paperclipSecretVersion = readPaperclipSecretVersion(value);
      const paperclipSecretStatus = typeof value.status === "string" ? value.status : undefined;
      const paperclipSecretName = typeof value.name === "string" ? value.name : undefined;
      if (!paperclipSecretId || !paperclipSecretKey) {
        return null;
      }
      return {
        paperclipSecretId,
        paperclipSecretKey,
        ...(paperclipSecretVersion ? { paperclipSecretVersion } : {}),
        ...(paperclipSecretStatus ? { paperclipSecretStatus } : {}),
        ...(paperclipSecretName ? { paperclipSecretName } : {})
      };
    })
    .filter(
      (
        candidate
      ): candidate is { paperclipSecretId: string; paperclipSecretKey: string; paperclipSecretVersion?: string; paperclipSecretStatus?: string; paperclipSecretName?: string } =>
        candidate !== null
    );
}

async function setCompanySecretStatus(
  fetchImpl: FetchLike,
  baseUrl: string,
  headers: HeadersInit,
  input: { paperclipSecretId: string; status: "active" | "disabled" }
): Promise<unknown> {
  return requestJson(fetchImpl, `${baseUrl}/api/secrets/${encodeURIComponent(input.paperclipSecretId)}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({
      status: input.status
    })
  });
}

function readAgentAdapterConfig(agent: unknown): Record<string, unknown> {
  const record = asRecord(agent);
  return asRecord(record.adapterConfig);
}

function readAdapterEnv(adapterConfig: Record<string, unknown>): Record<string, unknown> {
  const env = adapterConfig.env;
  return env && typeof env === "object" ? { ...(env as Record<string, unknown>) } : {};
}

function deriveOrigin(baseUrl: string): string {
  const url = new URL(baseUrl);
  return `${url.protocol}//${url.host}`;
}

function normalizePaperclipSecretKey(value: string): string {
  return value.trim().toLowerCase();
}

function readPaperclipSecretVersion(body: Record<string, unknown>, fallback?: string): string {
  const value = body.latestVersion ?? body.latest_version ?? fallback;
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === "string" && value.trim().length > 0) {
    return value;
  }
  return fallback ?? "latest";
}

function toPaperclipVersionSelector(value?: string): string | number {
  if (!value || value.trim().length === 0) {
    return "latest";
  }
  if (/^\d+$/.test(value.trim())) {
    return Number(value.trim());
  }
  return value;
}

class PaperclipBoardSessionHttpError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown
  ) {
    super(`Paperclip board-session request failed: ${status}`);
    this.name = "PaperclipBoardSessionHttpError";
  }
}
