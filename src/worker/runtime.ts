import { loadEnv } from "../config/env.js";
import { loadRuntimeEnv } from "../api/runtime-server.js";
import { createDurableAuditSink } from "../audit/durable-audit.js";
import { createAcidGuardRepository } from "../db/acid-guard-repository.js";
import { createPgPool, createPgPoolQueryClient, createPgTransactionRunner } from "../db/postgres-client.js";
import { createSupabaseRepositories } from "../db/supabase-repositories.js";
import { createPaperclipClient } from "../paperclip/client.js";
import {
  createPaperclipSecretAdminHttpClient,
  createPaperclipSecretBindingRepository,
  createPaperclipSecretSyncService
} from "../paperclip/secret-sync.js";
import {
  ANTHROPIC_PROVIDER,
  OPENAI_API_PROVIDER,
  OPENROUTER_PROVIDER,
  type ProviderKind,
  XAI_GROK_PROVIDER
} from "../providers/provider-types.js";
import { createRuntimeProviderExecutionContextResolver } from "../providers/runtime-provider-execution.js";
import { createDebugSharedProviderFallbackResolver } from "../providers/runtime-provider-fallback.js";
import type { RuntimeProviderBinding } from "../providers/runtime-provider-resolution.js";
import { createEncryptedSecretVault } from "../secrets/encrypted-vault.js";
import { createPostgresEncryptedVaultStore } from "../secrets/postgres-vault-store.js";
import { createSecretService } from "../secrets/secret-service.js";
import { processWorkflowJob } from "../workflows/worker.js";
import { validateWorkflowQueuePayload } from "../workflows/queue.js";
import { createTenantExecutionGate } from "./tenant-execution-gate.js";

export type WorkerEnv = ReturnType<typeof loadWorkerEnv>;

export function loadWorkerEnv(source: NodeJS.ProcessEnv = process.env) {
  const appEnv = loadEnv(source);
  const runtimeEnv = loadRuntimeEnv(source);

  return {
    ...appEnv,
    ...runtimeEnv
  };
}

export function createWorkerRuntime(options: { env: WorkerEnv }) {
  const pool = createPgPool({
    connectionString: options.env.supabaseDbUrl,
    ...(options.env.supabaseDbSsl ? { sslMode: options.env.supabaseDbSsl } : {})
  });
  const queryClient = createPgPoolQueryClient(pool);
  const transactionRunner = createPgTransactionRunner(pool);
  const repositories = createSupabaseRepositories(queryClient);
  const paperclipSecretBindings = createPaperclipSecretBindingRepository(queryClient);
  const paperclipSecretSync =
    options.env.paperclipAdminToken && options.env.paperclipLaunchMode === "issues"
      ? createPaperclipSecretSyncService({
          adminClient: createPaperclipSecretAdminHttpClient({
            baseUrl: options.env.paperclipBaseUrl,
            adminToken: options.env.paperclipAdminToken
          }),
          bindings: paperclipSecretBindings
        })
      : null;
  const audit = createDurableAuditSink(queryClient);
  const acidRepository = createAcidGuardRepository(transactionRunner);
  const vault = createEncryptedSecretVault({
    masterKey: options.env.vaultMasterKey,
    store: createPostgresEncryptedVaultStore(queryClient)
  });
  const secretService = createSecretService({
    vault,
    repository: {
      create: repositories.createSecretReference,
      updateSecretRef: repositories.updateSecretRef,
      revoke: repositories.revokeSecretReference,
      findIdBySecretRef: repositories.findSecretReferenceId
    },
    audit
  });
  const providerExecutionResolver = createRuntimeProviderExecutionContextResolver({
    accessSecretRef: (input) => secretService.access(input)
  });
  const debugFallbackResolver = createDebugSharedProviderFallbackResolver({
    providerKind: "openai_api",
    ...(options.env.runtimeEnv.OPENAI_API_KEY ? { apiKey: options.env.runtimeEnv.OPENAI_API_KEY } : {}),
    ...(options.env.runtimeEnv.OPENAI_PROJECT_ID ? { projectId: options.env.runtimeEnv.OPENAI_PROJECT_ID } : {}),
    label: "Operator Debug Provider"
  });
  const paperclipClient = createPaperclipClient({
    baseUrl: options.env.paperclipBaseUrl,
    serviceToken: options.env.paperclipServiceToken,
    launchMode: options.env.paperclipLaunchMode,
    ...(options.env.paperclipLaunchMode === "issues" && options.env.paperclipIssueAgentId
      ? {
          issueLaunch: {
            resolveLaunchTarget: async () => ({
              agentId: options.env.paperclipIssueAgentId as string
            }),
            syncProviderSecretRefs: async ({ companyId, agentId, providerContext }) => {
              for (const binding of providerContext) {
                for (const envKey of resolvePaperclipEnvKeys(binding.providerKind as ProviderKind)) {
                  const existing = await paperclipSecretBindings.findActiveBySecretRef({
                    tenantId: companyIdToTenantId.get(companyId) ?? "",
                    paperclipCompanyId: companyId,
                    paperclipAgentId: agentId,
                    paperclipEnvKey: envKey,
                    secretRef: binding.secretRef
                  });
                  if (existing) {
                    continue;
                  }
                  const tenantId = companyIdToTenantId.get(companyId) ?? "";
                  const assignment = resolvePaperclipEnvAssignment(binding.providerKind as ProviderKind, envKey, binding.secretValues ?? {});
                  if (!paperclipSecretSync || !tenantId) {
                    throw new Error(`Missing Paperclip secret binding for ${binding.providerKind}:${envKey}`);
                  }
                  await paperclipSecretSync.syncBinding({
                    tenantId,
                    wealthFactorySecretReferenceId: await repositories.findSecretReferenceId({
                      tenantId,
                      secretRef: binding.secretRef
                    }),
                    paperclipCompanyId: companyId,
                    paperclipAgentId: agentId,
                    paperclipEnvKey: envKey,
                    providerKind: binding.providerKind as ProviderKind,
                    secretValue: assignment,
                    paperclipSecretKey: envKey
                  });
                }
              }
            },
            pollIntervalMs: options.env.paperclipIssuePollIntervalMs,
            maxPollAttempts: options.env.paperclipIssueMaxPollAttempts
          }
        }
      : {})
  });
  const executionGate = createTenantExecutionGate({
    maxConcurrentRuns: options.env.workerConcurrency,
    maxConcurrentRunsPerTenant: options.env.workerMaxActivePerTenant
  });
  const companyIdToTenantId = new Map<string, string>();

  return {
    async processQueuePayload(payload: unknown) {
      const validatedPayload = validateWorkflowQueuePayload(payload);

      return executionGate.run({
        tenantId: validatedPayload.tenantId,
        operation: async () =>
          processWorkflowJob({
            payload: validatedPayload,
            paperclipClient,
            tenantResolver: async (tenantId) => {
              const mapping = await repositories.resolvePaperclipCompanyMapping({ tenantId });
              companyIdToTenantId.set(mapping.paperclipCompanyId, tenantId);
              return { paperclipCompanyId: mapping.paperclipCompanyId };
            },
            authorizeRunStart: async () => true,
            isPaperclipEnabled: async () => true,
            checkEntitlement: async () => ({ allowed: true }),
            providerExecutionMode: options.env.providerExecutionMode,
            loadBoundProviderContext: async ({ tenantId, runId }) => {
              const context = await acidRepository.getBoundProviderContext({ tenantId, runId });
              return context as readonly RuntimeProviderBinding[] | null;
            },
            hydrateProviderContext: async ({ tenantId, runId, workflowId, providerBindings }) =>
              providerExecutionResolver.resolveForRun({
                tenantId,
                runId,
                workflowId,
                providerBindings
              }),
            resolveDebugSharedProvider: async ({ requiredCapabilities = ["text_generation"] }) =>
              debugFallbackResolver.resolveForRun({ requiredCapabilities })
          })
      });
    },

    getExecutionSnapshot() {
      return executionGate.getSnapshot();
    },

    async close() {
      await pool.end();
    }
  };
}

function resolvePaperclipEnvKeys(providerKind: ProviderKind): readonly string[] {
  switch (providerKind) {
    case "openai":
    case "openai_api":
      return OPENAI_API_PROVIDER.requiredSecrets.map((secret) => secret.envName);
    case "anthropic_api":
      return ANTHROPIC_PROVIDER.requiredSecrets.map((secret) => secret.envName);
    case "xai_grok_api":
      return XAI_GROK_PROVIDER.requiredSecrets.map((secret) => secret.envName);
    case "openrouter_api":
      return OPENROUTER_PROVIDER.requiredSecrets.map((secret) => secret.envName);
    default:
      throw new Error(`Unsupported Paperclip secret binding provider: ${providerKind}`);
  }
}

function resolvePaperclipEnvAssignment(providerKind: ProviderKind, envKey: string, secretValues: Record<string, string>): string {
  if ((providerKind === "openai" || providerKind === "openai_api") && envKey === "OPENAI_API_KEY") {
    return requireSecretValue(secretValues, "apiKey");
  }
  if (providerKind === "anthropic_api" && envKey === "ANTHROPIC_API_KEY") {
    return requireSecretValue(secretValues, "apiKey");
  }
  if (providerKind === "xai_grok_api" && envKey === "XAI_API_KEY") {
    return requireSecretValue(secretValues, "apiKey");
  }
  if (providerKind === "openrouter_api" && envKey === "OPENROUTER_API_KEY") {
    return requireSecretValue(secretValues, "apiKey");
  }
  throw new Error(`Unsupported Paperclip secret assignment for ${providerKind}:${envKey}`);
}

function requireSecretValue(secretValues: Record<string, string>, key: string): string {
  const value = secretValues[key];
  if (!value) {
    throw new Error(`Missing provider secret value: ${key}`);
  }
  return value;
}
