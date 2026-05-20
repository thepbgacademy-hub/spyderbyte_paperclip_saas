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
  createPaperclipSecretSyncService,
  toPaperclipEnvBindings
} from "../paperclip/secret-sync.js";
import { type ProviderKind } from "../providers/provider-types.js";
import { createRuntimeProviderExecutionContextResolver } from "../providers/runtime-provider-execution.js";
import { createDebugSharedProviderFallbackResolver } from "../providers/runtime-provider-fallback.js";
import type { RuntimeProviderBinding } from "../providers/runtime-provider-resolution.js";
import { createEncryptedSecretVault } from "../secrets/encrypted-vault.js";
import { createPostgresEncryptedVaultStore } from "../secrets/postgres-vault-store.js";
import { createSecretService } from "../secrets/secret-service.js";
import { processWorkflowJob } from "../workflows/worker.js";
import { validateWorkflowQueuePayload } from "../workflows/queue.js";
import { createAcidWorkflowStatusRecorder } from "../workflows/acid-status-recorder.js";
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
    options.env.paperclipBoardSessionToken && options.env.paperclipLaunchMode === "issues"
      ? createPaperclipSecretSyncService({
          adminClient: createPaperclipSecretAdminHttpClient({
            baseUrl: options.env.paperclipBaseUrl,
            adminToken: options.env.paperclipBoardSessionToken,
            ...(options.env.paperclipBoardOrigin
              ? {
                  origin: options.env.paperclipBoardOrigin,
                  referer: `${options.env.paperclipBoardOrigin.replace(/\/+$/, "")}/`
                }
              : {})
          }),
          bindings: paperclipSecretBindings
        })
      : null;
  const audit = createDurableAuditSink(queryClient);
  const acidRepository = createAcidGuardRepository(transactionRunner);
  const recordWorkflowStatus = createAcidWorkflowStatusRecorder(acidRepository);
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
              const tenantId = companyIdToTenantId.get(companyId) ?? "";
              const env: Record<string, { type: "secret_ref"; secretId: string; version: string }> = {};
              for (const binding of providerContext) {
                for (const bindingTarget of toPaperclipEnvBindings(binding.providerKind as ProviderKind, binding.secretValues ?? {})) {
                  if (!tenantId) {
                    throw new Error(`Missing tenant context for Paperclip company ${companyId}`);
                  }
                  if (!paperclipSecretSync) {
                    const existing = await paperclipSecretBindings.findActiveBySecretRef({
                      tenantId,
                      paperclipCompanyId: companyId,
                      paperclipAgentId: agentId,
                      paperclipEnvKey: bindingTarget.envKey,
                      secretRef: binding.secretRef
                    });
                    if (!existing) {
                      throw new Error(`Missing Paperclip secret binding for ${binding.providerKind}:${bindingTarget.envKey}`);
                    }
                    if (!existing.paperclipSecretVersion) {
                      throw new Error(`Missing Paperclip secret version for ${binding.providerKind}:${bindingTarget.envKey}`);
                    }
                    env[bindingTarget.envKey] = {
                      type: "secret_ref",
                      secretId: existing.paperclipSecretId,
                      version: existing.paperclipSecretVersion
                    };
                    continue;
                  }
                  const syncedSecret = await paperclipSecretSync.syncBinding({
                    tenantId,
                    wealthFactorySecretReferenceId: await repositories.findSecretReferenceId({
                      tenantId,
                      secretRef: binding.secretRef
                    }),
                    paperclipCompanyId: companyId,
                    paperclipAgentId: agentId,
                    paperclipEnvKey: bindingTarget.envKey,
                    providerKind: binding.providerKind as ProviderKind,
                    secretValue: bindingTarget.secretValue,
                    paperclipSecretKey: bindingTarget.envKey,
                    bindToAgent: false
                  });
                  env[bindingTarget.envKey] = {
                    type: "secret_ref",
                    secretId: syncedSecret.paperclipSecretId,
                    version: syncedSecret.paperclipSecretVersion
                  };
                }
              }
              return Object.keys(env).length > 0 ? { adapterConfig: { env } } : undefined;
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
              debugFallbackResolver.resolveForRun({ requiredCapabilities }),
            recordStatus: async (status) => {
              await recordWorkflowStatus(status);
            }
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
