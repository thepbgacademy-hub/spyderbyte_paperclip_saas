import { loadEnv } from "../config/env.js";
import { loadRuntimeEnv } from "../api/runtime-server.js";
import { createAcidGuardRepository } from "../db/acid-guard-repository.js";
import { createPgPool, createPgPoolQueryClient, createPgTransactionRunner } from "../db/postgres-client.js";
import { createSupabaseRepositories } from "../db/supabase-repositories.js";
import { createPaperclipClient } from "../paperclip/client.js";
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
    audit: async () => undefined
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
    serviceToken: options.env.paperclipServiceToken
  });
  const executionGate = createTenantExecutionGate({
    maxConcurrentRuns: options.env.workerConcurrency,
    maxConcurrentRunsPerTenant: options.env.workerMaxActivePerTenant
  });

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
