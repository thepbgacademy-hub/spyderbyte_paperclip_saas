import { loadEnv } from "../config/env.js";
import { loadRuntimeEnv } from "../api/runtime-server.js";
import { createDurableAuditSink } from "../audit/durable-audit.js";
import { createAcidGuardRepository } from "../db/acid-guard-repository.js";
import { createPgPool, createPgPoolQueryClient, createPgTransactionRunner } from "../db/postgres-client.js";
import { createSupabaseRepositories } from "../db/supabase-repositories.js";
import {
  buildHarnessWorkerDispatch,
  commitHarnessWorkerLaneOutcome,
  type HarnessWorkerDispatch,
  type HarnessWorkerLaneOutcome
} from "../harness/worker-executor.js";
import { createPostgresHarnessRepository } from "../harness/repository.js";
import { createPaperclipClient } from "../paperclip/client.js";
import {
  createPaperclipSecretAdminHttpClient,
  createPaperclipSecretBindingRepository,
  createPaperclipSecretSyncService,
  toPaperclipEnvBindings,
  toPaperclipSecretRefBinding
} from "../paperclip/secret-sync.js";
import { type ProviderKind } from "../providers/provider-types.js";
import { createRuntimeProviderExecutionContextResolver } from "../providers/runtime-provider-execution.js";
import { createDebugSharedProviderFallbackResolver } from "../providers/runtime-provider-fallback.js";
import type { RuntimeProviderBinding } from "../providers/runtime-provider-resolution.js";
import { createEncryptedSecretVault } from "../secrets/encrypted-vault.js";
import { createPostgresEncryptedVaultStore } from "../secrets/postgres-vault-store.js";
import { createSecretService } from "../secrets/secret-service.js";
import { createHarnessWorkflowRegistry } from "../wealthfactory/workflow-registry.js";
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

export function createWorkerRuntime(options: { env: WorkerEnv; workerInstanceId?: string }) {
  const pool = createPgPool({
    connectionString: options.env.supabaseDbUrl,
    ...(options.env.supabaseDbSsl ? { sslMode: options.env.supabaseDbSsl } : {})
  });
  const queryClient = createPgPoolQueryClient(pool);
  const transactionRunner = createPgTransactionRunner(pool);
  const repositories = createSupabaseRepositories(queryClient);
  const harnessRepository = createPostgresHarnessRepository(queryClient);
  const harnessWorkflowRegistry = createHarnessWorkflowRegistry({
    harnessEnabledWorkflowIds: options.env.harnessEnabledWorkflowIds
  });
  const paperclipSecretBindings = createPaperclipSecretBindingRepository(queryClient);
  const paperclipSecretSync =
    options.env.paperclipBoardSessionToken && options.env.paperclipLaunchMode === "issues"
      ? createPaperclipSecretSyncService({
          adminClient: createPaperclipSecretAdminHttpClient({
            baseUrl: options.env.paperclipBoardOrigin ?? options.env.paperclipBaseUrl,
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
  const companyIdToTenantId = new Map<string, string>();
  const companyIdToIssueAgentId = new Map<string, string>();
  const companyIdToServiceToken = new Map<string, string>();
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
  const inFlightPaperclipSecretBindings = new Map<string, Promise<{ type: "secret_ref"; secretId: string; version: string | number }>>();

  async function resolveExistingPaperclipSecretRefBinding(input: {
    tenantId: string;
    companyId: string;
    agentId: string;
    envKey: string;
    secretRef: string;
  }) {
    const existing =
      await paperclipSecretBindings.findActiveBySecretRef({
        tenantId: input.tenantId,
        paperclipCompanyId: input.companyId,
        paperclipAgentId: input.agentId,
        paperclipEnvKey: input.envKey,
        secretRef: input.secretRef
      })
      ?? await paperclipSecretBindings.findActiveBySecretRef({
        tenantId: input.tenantId,
        paperclipCompanyId: input.companyId,
        paperclipEnvKey: input.envKey,
        secretRef: input.secretRef
      });
    if (!existing) {
      return null;
    }
    if (!existing.paperclipSecretVersion) {
      throw new Error(`Missing Paperclip secret version for ${input.envKey}`);
    }
    return toPaperclipSecretRefBinding({
      paperclipSecretId: existing.paperclipSecretId,
      paperclipSecretVersion: existing.paperclipSecretVersion
    });
  }

  function createPaperclipBindingKey(input: {
    tenantId: string;
    companyId: string;
    agentId: string;
    envKey: string;
    secretRef: string;
  }) {
    return `${input.tenantId}:${input.companyId}:${input.agentId}:${input.envKey}:${input.secretRef}`;
  }

  function isRetryablePaperclipSecretSyncError(error: unknown) {
    if (!(error instanceof Error)) {
      return false;
    }
    if (error.name === "PaperclipBoardSessionHttpError" && /\b(500|502|503|504)\b/.test(error.message)) {
      return true;
    }
    return /Paperclip board-session request failed: (500|502|503|504)\b/.test(error.message);
  }

  async function resolveOrSyncPaperclipSecretRefBinding(input: {
    tenantId: string;
    companyId: string;
    agentId: string;
    envKey: string;
    secretRef: string;
    providerKind: ProviderKind;
    secretValue: string;
  }) {
    const existingBinding = await resolveExistingPaperclipSecretRefBinding({
      tenantId: input.tenantId,
      companyId: input.companyId,
      agentId: input.agentId,
      envKey: input.envKey,
      secretRef: input.secretRef
    });
    if (existingBinding) {
      return existingBinding;
    }
    if (!paperclipSecretSync) {
      throw new Error(`Missing Paperclip secret binding for ${input.providerKind}:${input.envKey}`);
    }

    const bindingKey = createPaperclipBindingKey(input);
    const inFlightBinding = inFlightPaperclipSecretBindings.get(bindingKey);
    if (inFlightBinding) {
      return inFlightBinding;
    }

    const refreshPromise = (async () => {
      const recoveredBeforeSync = await resolveExistingPaperclipSecretRefBinding({
        tenantId: input.tenantId,
        companyId: input.companyId,
        agentId: input.agentId,
        envKey: input.envKey,
        secretRef: input.secretRef
      });
      if (recoveredBeforeSync) {
        return recoveredBeforeSync;
      }

      const runningRunCount = await repositories.countRunningWorkflowRuns({ tenantId: input.tenantId });
      if (runningRunCount > 0) {
        throw new Error(
          `Paperclip secret binding refresh deferred for ${input.providerKind}:${input.envKey} while another tenant run is still active`
        );
      }

      for (let attempt = 1; attempt <= 3; attempt += 1) {
        try {
          const synced = await paperclipSecretSync.syncBinding({
            tenantId: input.tenantId,
            wealthFactorySecretReferenceId: await repositories.findSecretReferenceId({
              tenantId: input.tenantId,
              secretRef: input.secretRef
            }),
            paperclipCompanyId: input.companyId,
            paperclipAgentId: input.agentId,
            paperclipEnvKey: input.envKey,
            providerKind: input.providerKind,
            secretValue: input.secretValue,
            paperclipSecretKey: input.envKey
          });
          return toPaperclipSecretRefBinding({
            paperclipSecretId: synced.paperclipSecretId,
            paperclipSecretVersion: synced.paperclipSecretVersion
          });
        } catch (error) {
          const recoveredBinding = await resolveExistingPaperclipSecretRefBinding({
            tenantId: input.tenantId,
            companyId: input.companyId,
            agentId: input.agentId,
            envKey: input.envKey,
            secretRef: input.secretRef
          });
          if (recoveredBinding) {
            return recoveredBinding;
          }
          if (attempt >= 3 || !isRetryablePaperclipSecretSyncError(error)) {
            throw error;
          }
        }
      }

      throw new Error(`Paperclip secret binding refresh exhausted retries for ${input.providerKind}:${input.envKey}`);
    })();

    const trackedBindingPromise = refreshPromise.finally(() => {
      if (inFlightPaperclipSecretBindings.get(bindingKey) === trackedBindingPromise) {
        inFlightPaperclipSecretBindings.delete(bindingKey);
      }
    });
    inFlightPaperclipSecretBindings.set(bindingKey, trackedBindingPromise);
    return trackedBindingPromise;
  }

  const paperclipClient = createPaperclipClient({
    baseUrl: options.env.paperclipBaseUrl,
    serviceToken: options.env.paperclipServiceToken,
    launchMode: options.env.paperclipLaunchMode,
    ...(options.env.paperclipLaunchMode === "issues"
      ? {
        issueLaunch: {
            resolveServiceToken: async ({ companyId }) => {
              const mappedToken = companyIdToServiceToken.get(companyId);
              if (mappedToken) {
                return mappedToken;
              }
              return options.env.paperclipServiceToken;
            },
            resolveLaunchTarget: async ({ companyId }) => {
              const mappedAgentId = companyIdToIssueAgentId.get(companyId) ?? options.env.paperclipIssueAgentId;
              if (!mappedAgentId) {
                throw new Error(`Missing Paperclip issue agent mapping for company ${companyId}`);
              }
              return {
                agentId: mappedAgentId
              };
            },
            syncProviderSecretRefs: async ({ companyId, agentId, providerContext }) => {
              const tenantId = companyIdToTenantId.get(companyId) ?? "";
              const adapterEnv: Record<string, { type: "secret_ref"; secretId: string; version: string | number }> = {};
              for (const binding of providerContext) {
                for (const bindingTarget of toPaperclipEnvBindings(binding.providerKind as ProviderKind, binding.secretValues ?? {})) {
                  if (!tenantId) {
                    throw new Error(`Missing tenant context for Paperclip company ${companyId}`);
                  }
                  adapterEnv[bindingTarget.envKey] = await resolveOrSyncPaperclipSecretRefBinding({
                    tenantId,
                    companyId: companyId,
                    agentId: agentId,
                    envKey: bindingTarget.envKey,
                    secretRef: binding.secretRef,
                    providerKind: binding.providerKind as ProviderKind,
                    secretValue: bindingTarget.secretValue
                  });
                }
              }
              return {
                adapterConfig: {
                  env: adapterEnv
                }
              };
            },
            pollIntervalMs: options.env.paperclipIssuePollIntervalMs,
            maxPollAttempts: options.env.paperclipIssueMaxPollAttempts
          }
        }
      : {})
  });
  const executionGate = createTenantExecutionGate({
    maxConcurrentRuns: options.env.workerConcurrency,
    maxConcurrentRunsPerTenant: options.env.workerMaxActivePerTenant,
    onSnapshot: (snapshot) => {
      process.stdout.write(
        `${JSON.stringify({
          type: "wealth_factory_worker_fairness",
          workerInstanceId: options.workerInstanceId ?? "worker",
          observedAt: new Date().toISOString(),
          ...snapshot
        })}\n`
      );
    }
  });

  return {
    async processQueuePayload(payload: unknown) {
      const validatedPayload = validateWorkflowQueuePayload(payload);

      return executionGate.run({
        tenantId: validatedPayload.tenantId,
        onStarted: (snapshot) => emitWorkerRunEvent("started", validatedPayload, snapshot),
        onReleased: (snapshot) => emitWorkerRunEvent("released", validatedPayload, snapshot),
        operation: async () =>
          harnessWorkflowRegistry.isHarnessEligible(validatedPayload.workflowId)
            ? processHarnessWorkflowJob({
                payload: validatedPayload,
                repository: harnessRepository,
                runAtomically: (work) =>
                  transactionRunner.withTransaction((transaction) =>
                    work(createPostgresHarnessRepository(transaction))
                  ),
                recordStatus: async (status) => {
                  await recordWorkflowStatus(status);
                },
                onDispatch: (dispatch) => {
                  process.stdout.write(
                    `${JSON.stringify({
                      type: "wealth_factory_harness_lane_dispatch",
                      workerInstanceId: options.workerInstanceId ?? "worker",
                      observedAt: new Date().toISOString(),
                      ...dispatch
                    })}\n`
                  );
                }
              })
            : processWorkflowJob({
                payload: validatedPayload,
                paperclipClient,
                tenantResolver: async (tenantId) => {
                  const mapping = await repositories.resolvePaperclipCompanyMapping({ tenantId });
                  companyIdToTenantId.set(mapping.paperclipCompanyId, tenantId);
                  if (mapping.paperclipIssueAgentId) {
                    companyIdToIssueAgentId.set(mapping.paperclipCompanyId, mapping.paperclipIssueAgentId);
                  } else {
                    companyIdToIssueAgentId.delete(mapping.paperclipCompanyId);
                  }
                  const mappedToken = options.env.paperclipServiceTokensByCompany[mapping.paperclipCompanyId];
                  if (mappedToken) {
                    companyIdToServiceToken.set(mapping.paperclipCompanyId, mappedToken);
                  } else {
                    companyIdToServiceToken.delete(mapping.paperclipCompanyId);
                  }
                  return {
                    paperclipCompanyId: mapping.paperclipCompanyId,
                    ...(mapping.paperclipIssueAgentId ? { paperclipIssueAgentId: mapping.paperclipIssueAgentId } : {})
                  };
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

    async commitHarnessLaneOutcome(input: {
      tenantId: string;
      runId: string;
      workflowId: string;
      cardId: string;
      state: "waiting" | "done" | "blocked" | "cancelled";
      resultSummary?: string;
      resumeSummary?: string;
    }) {
      if (!harnessWorkflowRegistry.isHarnessEligible(input.workflowId)) {
        throw new Error(`Harness lane outcome is not enabled for workflow ${input.workflowId}`);
      }

      const outcome = await processHarnessLaneOutcome({
        payload: input,
        repository: harnessRepository,
        runAtomically: (work) =>
          transactionRunner.withTransaction((transaction) =>
            work(createPostgresHarnessRepository(transaction))
          ),
        recordStatus: async (status) => {
          await recordWorkflowStatus(status);
        },
        onOutcome: (committedOutcome) => {
          process.stdout.write(
            `${JSON.stringify({
              type: "wealth_factory_harness_lane_outcome",
              workerInstanceId: options.workerInstanceId ?? "worker",
              observedAt: new Date().toISOString(),
              ...committedOutcome
            })}\n`
          );
          if (committedOutcome.nextDispatch?.laneExecution) {
            process.stdout.write(
              `${JSON.stringify({
                type: "wealth_factory_harness_lane_dispatch",
                workerInstanceId: options.workerInstanceId ?? "worker",
                observedAt: new Date().toISOString(),
                ...committedOutcome.nextDispatch
              })}\n`
            );
          }
        }
      });
      return outcome;
    },

    async close() {
      await pool.end();
    }
  };

  function emitWorkerRunEvent(
    event: "started" | "released",
    payload: { tenantId: string; runId: string; workflowId: string },
    snapshot: { activeRuns: number; activeByTenant: Record<string, number>; queuedByTenant: Record<string, number> }
  ) {
    process.stdout.write(
      `${JSON.stringify({
        type: "wealth_factory_worker_run",
        workerInstanceId: options.workerInstanceId ?? "worker",
        observedAt: new Date().toISOString(),
        event,
        tenantId: payload.tenantId,
        runId: payload.runId,
        workflowId: payload.workflowId,
        execution: snapshot
      })}\n`
    );
  }
}

async function processHarnessWorkflowJob(options: {
  payload: {
    tenantId: string;
    runId: string;
    workflowId: string;
  };
  repository: Pick<
    ReturnType<typeof createPostgresHarnessRepository>,
    | "getRun"
    | "getCard"
    | "getCardContinuity"
    | "listCardsForRun"
    | "listProposalsForRun"
    | "listCardContinuityForRun"
    | "claimCardForExecution"
    | "transitionCardState"
    | "insertEvent"
    | "upsertCardContinuity"
    | "updateRunState"
  >;
  runAtomically?: <T>(
    work: (
      repository: Pick<
        ReturnType<typeof createPostgresHarnessRepository>,
        | "getRun"
        | "getCard"
        | "getCardContinuity"
        | "listCardsForRun"
        | "listProposalsForRun"
        | "listCardContinuityForRun"
        | "claimCardForExecution"
        | "transitionCardState"
        | "insertEvent"
        | "upsertCardContinuity"
        | "updateRunState"
      >
    ) => Promise<T>
  ) => Promise<T>;
  recordStatus?: (status: { tenantId: string; runId: string; workflowId: string; status: "queued" | "running" | "failed" }) => void | Promise<void>;
  onDispatch?: (dispatch: HarnessWorkerDispatch) => void;
}) {
  try {
    const dispatch = await buildHarnessWorkerDispatch({
      repository: options.repository,
      tenantId: options.payload.tenantId,
      runId: options.payload.runId,
      workflowId: options.payload.workflowId,
      ...(options.runAtomically ? { runAtomically: options.runAtomically } : {})
    });
    if (dispatch.laneExecution) {
      options.onDispatch?.(dispatch);
      await options.recordStatus?.({
        tenantId: options.payload.tenantId,
        runId: dispatch.runId,
        workflowId: dispatch.workflowId,
        status: dispatch.status
      });
    }
    return {
      runId: dispatch.runId,
      workflowId: dispatch.workflowId,
      status: dispatch.status
    };
  } catch (error) {
    await options.recordStatus?.({
      tenantId: options.payload.tenantId,
      runId: options.payload.runId,
      workflowId: options.payload.workflowId,
      status: "failed"
    });
    throw error;
  }
}

async function processHarnessLaneOutcome(options: {
  payload: {
    tenantId: string;
    runId: string;
    workflowId: string;
    cardId: string;
    state: "waiting" | "done" | "blocked" | "cancelled";
    resultSummary?: string;
    resumeSummary?: string;
  };
  repository: Pick<
    ReturnType<typeof createPostgresHarnessRepository>,
    | "getRun"
    | "getCard"
    | "getCardContinuity"
    | "listCardsForRun"
    | "listProposalsForRun"
    | "listCardContinuityForRun"
    | "claimCardForExecution"
    | "transitionCardState"
    | "insertEvent"
    | "upsertCardContinuity"
    | "updateRunState"
  >;
  runAtomically?: <T>(
    work: (
      repository: Pick<
        ReturnType<typeof createPostgresHarnessRepository>,
        | "getRun"
        | "getCard"
        | "getCardContinuity"
        | "listCardsForRun"
        | "listProposalsForRun"
        | "listCardContinuityForRun"
        | "claimCardForExecution"
        | "transitionCardState"
        | "insertEvent"
        | "upsertCardContinuity"
        | "updateRunState"
      >
    ) => Promise<T>
  ) => Promise<T>;
  recordStatus?: (status: { tenantId: string; runId: string; workflowId: string; status: "running" }) => void | Promise<void>;
  onOutcome?: (outcome: HarnessWorkerLaneOutcome) => void;
}) {
  const outcome = await commitHarnessWorkerLaneOutcome({
    repository: options.repository,
    tenantId: options.payload.tenantId,
    runId: options.payload.runId,
    workflowId: options.payload.workflowId,
    cardId: options.payload.cardId,
    state: options.payload.state,
    ...(options.payload.resultSummary ? { resultSummary: options.payload.resultSummary } : {}),
    ...(options.payload.resumeSummary ? { resumeSummary: options.payload.resumeSummary } : {}),
    ...(options.runAtomically ? { runAtomically: options.runAtomically } : {})
  });
  if (outcome.status === "committed" && outcome.nextDispatch?.laneExecution) {
    await options.recordStatus?.({
      tenantId: options.payload.tenantId,
      runId: outcome.nextDispatch.runId,
      workflowId: outcome.nextDispatch.workflowId,
      status: "running"
    });
  }
  if (outcome.status === "committed") {
    options.onOutcome?.(outcome);
  }
  return outcome;
}
