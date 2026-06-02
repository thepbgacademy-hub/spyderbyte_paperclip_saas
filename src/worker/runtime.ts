import { loadEnv } from "../config/env.js";
import { loadRuntimeEnv } from "../api/runtime-server.js";
import { createDurableAuditSink } from "../audit/durable-audit.js";
import { createAcidGuardRepository } from "../db/acid-guard-repository.js";
import { createPgPool, createPgPoolQueryClient, createPgTransactionRunner } from "../db/postgres-client.js";
import { createSupabaseRepositories } from "../db/supabase-repositories.js";
import {
  buildHarnessWorkerExecutionEnvelope,
  buildHarnessWorkerDispatchResolution,
  commitHarnessWorkerLaneOutcome,
  type HarnessWorkerDispatch,
  type HarnessWorkerLaneAttentionTransition,
  type HarnessWorkerExecutionEnvelope,
  type HarnessWorkerLaneOutcome
} from "../harness/worker-executor.js";
import { type HarnessPostOutcomeAction } from "../harness/post-outcome.js";
import { createPostgresHarnessRepository } from "../harness/repository.js";
import { createPaperclipClient } from "../paperclip/client.js";
import type { PaperclipRunStatus } from "../paperclip/types.js";
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

export function createWorkerRuntime(options: {
  env: WorkerEnv;
  workerInstanceId?: string;
  onHarnessLaneReady?: (envelope: HarnessWorkerExecutionEnvelope) => void | Promise<void>;
  onHarnessLaneOutcomeCommitted?: (input: {
    tenantId: string;
    runId: string;
    workflowId: string;
    laneExecution: NonNullable<HarnessWorkerLaneOutcome["laneExecution"]>;
    attentionTransition: HarnessWorkerLaneAttentionTransition;
    postOutcomeAction?: HarnessWorkerLaneOutcome["postOutcomeAction"];
    nextDispatch?: HarnessWorkerLaneOutcome["nextDispatch"];
  }) => void | Promise<void>;
  onHarnessLaneDone?: (input: {
    tenantId: string;
    runId: string;
    workflowId: string;
    laneExecution: NonNullable<HarnessWorkerLaneOutcome["laneExecution"]>;
    attentionTransition: HarnessWorkerLaneAttentionTransition;
    postOutcomeAction?: HarnessWorkerLaneOutcome["postOutcomeAction"];
    nextDispatch?: HarnessWorkerLaneOutcome["nextDispatch"];
  }) => void | Promise<void>;
  onHarnessLaneWaiting?: (input: {
    tenantId: string;
    runId: string;
    workflowId: string;
    laneExecution: NonNullable<HarnessWorkerLaneOutcome["laneExecution"]>;
    attentionTransition: HarnessWorkerLaneAttentionTransition;
    postOutcomeAction?: HarnessWorkerLaneOutcome["postOutcomeAction"];
  }) => void | Promise<void>;
  onHarnessLaneBlocked?: (input: {
    tenantId: string;
    runId: string;
    workflowId: string;
    laneExecution: NonNullable<HarnessWorkerLaneOutcome["laneExecution"]>;
    attentionTransition: HarnessWorkerLaneAttentionTransition;
    postOutcomeAction?: HarnessWorkerLaneOutcome["postOutcomeAction"];
  }) => void | Promise<void>;
  onHarnessLaneCancelled?: (input: {
    tenantId: string;
    runId: string;
    workflowId: string;
    laneExecution: NonNullable<HarnessWorkerLaneOutcome["laneExecution"]>;
    attentionTransition: HarnessWorkerLaneAttentionTransition;
    postOutcomeAction?: HarnessWorkerLaneOutcome["postOutcomeAction"];
    nextDispatch?: HarnessWorkerLaneOutcome["nextDispatch"];
  }) => void | Promise<void>;
  onHarnessLaneOutcomeIgnored?: (input: {
    tenantId: string;
    runId: string;
    workflowId: string;
    cardId: string;
    ignored: NonNullable<HarnessWorkerLaneOutcome["ignored"]>;
  }) => void | Promise<void>;
  onHarnessAttentionResolved?: (input: {
    tenantId: string;
    runId: string;
    workflowId: string;
    action: Exclude<HarnessPostOutcomeAction, { kind: "dispatch_next_lane" }>;
    laneExecution: NonNullable<HarnessWorkerLaneOutcome["laneExecution"]>;
  }) => void | Promise<void>;
  onHarnessPostOutcomeAction?: (input: {
    tenantId: string;
    runId: string;
    workflowId: string;
    action: Exclude<HarnessPostOutcomeAction, { kind: "dispatch_next_lane" }>;
    laneExecution: NonNullable<HarnessWorkerLaneOutcome["laneExecution"]>;
  }) => void | Promise<void>;
  onHarnessCeoReviewRequested?: (input: {
    tenantId: string;
    runId: string;
    workflowId: string;
    action: Extract<Exclude<HarnessPostOutcomeAction, { kind: "dispatch_next_lane" }>, { kind: "queue_ceo_review" }>;
    laneExecution: NonNullable<HarnessWorkerLaneOutcome["laneExecution"]>;
  }) => void | Promise<void>;
  onHarnessLaneResumeAwaited?: (input: {
    tenantId: string;
    runId: string;
    workflowId: string;
    action: Extract<Exclude<HarnessPostOutcomeAction, { kind: "dispatch_next_lane" }>, { kind: "await_lane_resume" }>;
    laneExecution: NonNullable<HarnessWorkerLaneOutcome["laneExecution"]>;
  }) => void | Promise<void>;
  onHarnessLaneUnblockAwaited?: (input: {
    tenantId: string;
    runId: string;
    workflowId: string;
    action: Extract<Exclude<HarnessPostOutcomeAction, { kind: "dispatch_next_lane" }>, { kind: "await_unblock" }>;
    laneExecution: NonNullable<HarnessWorkerLaneOutcome["laneExecution"]>;
  }) => void | Promise<void>;
}) {
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
                workflowRegistry: harnessWorkflowRegistry,
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
                },
                ...(options.onHarnessLaneReady
                  ? {
                      onExecutionEnvelope: async (envelope: HarnessWorkerExecutionEnvelope) => {
                        await options.onHarnessLaneReady?.(envelope);
                      }
                    }
                  : {})
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
      executionClaimToken?: string;
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
        onOutcome: async (workerOutcome) => {
          if (workerOutcome.status === "ignored" && workerOutcome.ignored) {
            const ignoredOutcomeHandoff = {
              tenantId: input.tenantId,
              runId: workerOutcome.runId,
              workflowId: workerOutcome.workflowId,
              cardId: input.cardId,
              ignored: workerOutcome.ignored
            };
            process.stdout.write(
              `${JSON.stringify({
                type: "wealth_factory_harness_lane_outcome_ignored",
                workerInstanceId: options.workerInstanceId ?? "worker",
                observedAt: new Date().toISOString(),
                ...ignoredOutcomeHandoff
              })}\n`
            );
            try {
              await options.onHarnessLaneOutcomeIgnored?.(ignoredOutcomeHandoff);
            } catch (error) {
              console.warn("Harness ignored-outcome hook failed after fail-closed worker rejection", {
                runId: workerOutcome.runId,
                workflowId: workerOutcome.workflowId,
                cardId: input.cardId,
                reason: workerOutcome.ignored.reason,
                error: error instanceof Error ? { name: error.name, message: error.message } : { message: String(error) }
              });
            }
            return;
          }
          const committedOutcome = workerOutcome;
          process.stdout.write(
            `${JSON.stringify({
              type: "wealth_factory_harness_lane_outcome",
              workerInstanceId: options.workerInstanceId ?? "worker",
              observedAt: new Date().toISOString(),
              ...committedOutcome
            })}\n`
          );
          if (committedOutcome.laneExecution) {
            const committedOutcomeHandoff = {
              tenantId: input.tenantId,
              runId: committedOutcome.runId,
              workflowId: committedOutcome.workflowId,
              laneExecution: committedOutcome.laneExecution,
              attentionTransition: committedOutcome.attentionTransition ?? { kind: "none" as const },
              ...(committedOutcome.postOutcomeAction ? { postOutcomeAction: committedOutcome.postOutcomeAction } : {}),
              ...(committedOutcome.nextDispatch ? { nextDispatch: committedOutcome.nextDispatch } : {})
            };
            process.stdout.write(
              `${JSON.stringify({
                type: "wealth_factory_harness_lane_outcome_committed",
                workerInstanceId: options.workerInstanceId ?? "worker",
                observedAt: new Date().toISOString(),
                ...committedOutcomeHandoff
              })}\n`
            );
            try {
              await options.onHarnessLaneOutcomeCommitted?.(committedOutcomeHandoff);
            } catch (error) {
              console.warn("Harness committed-outcome hook failed after durable worker outcome", {
                runId: committedOutcome.runId,
                workflowId: committedOutcome.workflowId,
                cardId: committedOutcome.laneExecution.cardId,
                error: error instanceof Error ? { name: error.name, message: error.message } : { message: String(error) }
              });
            }
            try {
              await runSpecificCommittedOutcomeHandler({
                options,
                handoff: committedOutcomeHandoff
              });
            } catch (error) {
              console.warn("Harness specific committed-outcome handler failed after durable worker outcome", {
                runId: committedOutcome.runId,
                workflowId: committedOutcome.workflowId,
                cardId: committedOutcome.laneExecution.cardId,
                state: committedOutcome.laneExecution.state,
                error: error instanceof Error ? { name: error.name, message: error.message } : { message: String(error) }
              });
            }
          }
          const resolvedAttentionAction = readResolvedAttentionAction(committedOutcome.attentionTransition);
          if (resolvedAttentionAction && committedOutcome.laneExecution) {
            const attentionResolvedHandoff = {
              tenantId: input.tenantId,
              runId: committedOutcome.runId,
              workflowId: committedOutcome.workflowId,
              action: resolvedAttentionAction,
              laneExecution: committedOutcome.laneExecution
            };
            process.stdout.write(
              `${JSON.stringify({
                type: "wealth_factory_harness_attention_resolved",
                workerInstanceId: options.workerInstanceId ?? "worker",
                observedAt: new Date().toISOString(),
                ...attentionResolvedHandoff
              })}\n`
            );
            try {
              await options.onHarnessAttentionResolved?.(attentionResolvedHandoff);
            } catch (error) {
              console.warn("Harness attention-resolved hook failed after durable worker outcome", {
                runId: committedOutcome.runId,
                workflowId: committedOutcome.workflowId,
                cardId: committedOutcome.laneExecution.cardId,
                actionKind: resolvedAttentionAction.kind,
                error: error instanceof Error ? { name: error.name, message: error.message } : { message: String(error) }
              });
            }
          }
          if (
            committedOutcome.postOutcomeAction
            && committedOutcome.postOutcomeAction.kind !== "dispatch_next_lane"
            && committedOutcome.laneExecution
            && committedOutcome.attentionTransition?.kind !== "unchanged"
          ) {
            const postOutcomeHandoff = {
              tenantId: input.tenantId,
              runId: committedOutcome.runId,
              workflowId: committedOutcome.workflowId,
              action: committedOutcome.postOutcomeAction,
              laneExecution: committedOutcome.laneExecution
            };
            process.stdout.write(
              `${JSON.stringify({
                type: "wealth_factory_harness_post_outcome_action",
                workerInstanceId: options.workerInstanceId ?? "worker",
                observedAt: new Date().toISOString(),
                ...postOutcomeHandoff
              })}\n`
            );
            try {
              await options.onHarnessPostOutcomeAction?.(postOutcomeHandoff);
            } catch (error) {
              console.warn("Harness post-outcome hook failed after durable worker outcome", {
                runId: committedOutcome.runId,
                workflowId: committedOutcome.workflowId,
                cardId: committedOutcome.laneExecution.cardId,
                actionKind: committedOutcome.postOutcomeAction.kind,
                error: error instanceof Error ? { name: error.name, message: error.message } : { message: String(error) }
              });
            }
            try {
              await runSpecificPostOutcomeHandler({
                options,
                handoff: postOutcomeHandoff
              });
            } catch (error) {
              console.warn("Harness specific post-outcome handler failed after durable worker outcome", {
                runId: committedOutcome.runId,
                workflowId: committedOutcome.workflowId,
                cardId: committedOutcome.laneExecution.cardId,
                actionKind: committedOutcome.postOutcomeAction.kind,
                error: error instanceof Error ? { name: error.name, message: error.message } : { message: String(error) }
              });
            }
          }
          if (committedOutcome.nextDispatch?.laneExecution) {
            const executionEnvelope = await buildHarnessWorkerExecutionEnvelope({
              repository: harnessRepository,
              tenantId: input.tenantId,
              dispatch: committedOutcome.nextDispatch,
              requiredCapabilities: harnessWorkflowRegistry.getDefinition(committedOutcome.nextDispatch.workflowId)
                .requiredCapabilities
            });
            if (executionEnvelope) {
              try {
                await options.onHarnessLaneReady?.(executionEnvelope);
              } catch (error) {
                console.warn("Harness lane-ready hook failed after durable follow-on dispatch", {
                  runId: executionEnvelope.runId,
                  workflowId: executionEnvelope.workflowId,
                  cardId: executionEnvelope.laneExecution.cardId,
                  error: error instanceof Error ? { name: error.name, message: error.message } : { message: String(error) }
                });
              }
            }
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

function readResolvedAttentionAction(
  transition: HarnessWorkerLaneAttentionTransition | undefined
): Exclude<HarnessPostOutcomeAction, { kind: "dispatch_next_lane" }> | null {
  return transition?.kind === "resolved" ? transition.resolvedAction : null;
}

async function runSpecificCommittedOutcomeHandler(input: {
  options: {
    workerInstanceId?: string;
    onHarnessLaneDone?: (input: {
      tenantId: string;
      runId: string;
      workflowId: string;
      laneExecution: NonNullable<HarnessWorkerLaneOutcome["laneExecution"]>;
      attentionTransition: HarnessWorkerLaneAttentionTransition;
      postOutcomeAction?: HarnessWorkerLaneOutcome["postOutcomeAction"];
      nextDispatch?: HarnessWorkerLaneOutcome["nextDispatch"];
    }) => void | Promise<void>;
    onHarnessLaneWaiting?: (input: {
      tenantId: string;
      runId: string;
      workflowId: string;
      laneExecution: NonNullable<HarnessWorkerLaneOutcome["laneExecution"]>;
      attentionTransition: HarnessWorkerLaneAttentionTransition;
      postOutcomeAction?: HarnessWorkerLaneOutcome["postOutcomeAction"];
    }) => void | Promise<void>;
    onHarnessLaneBlocked?: (input: {
      tenantId: string;
      runId: string;
      workflowId: string;
      laneExecution: NonNullable<HarnessWorkerLaneOutcome["laneExecution"]>;
      attentionTransition: HarnessWorkerLaneAttentionTransition;
      postOutcomeAction?: HarnessWorkerLaneOutcome["postOutcomeAction"];
    }) => void | Promise<void>;
    onHarnessLaneCancelled?: (input: {
      tenantId: string;
      runId: string;
      workflowId: string;
      laneExecution: NonNullable<HarnessWorkerLaneOutcome["laneExecution"]>;
      attentionTransition: HarnessWorkerLaneAttentionTransition;
      postOutcomeAction?: HarnessWorkerLaneOutcome["postOutcomeAction"];
      nextDispatch?: HarnessWorkerLaneOutcome["nextDispatch"];
    }) => void | Promise<void>;
  };
  handoff: {
    tenantId: string;
    runId: string;
    workflowId: string;
    laneExecution: NonNullable<HarnessWorkerLaneOutcome["laneExecution"]>;
    attentionTransition: HarnessWorkerLaneAttentionTransition;
    postOutcomeAction?: HarnessWorkerLaneOutcome["postOutcomeAction"];
    nextDispatch?: HarnessWorkerLaneOutcome["nextDispatch"];
  };
}) {
  switch (input.handoff.laneExecution.state) {
    case "done": {
      const laneDoneHandoff = {
        tenantId: input.handoff.tenantId,
        runId: input.handoff.runId,
        workflowId: input.handoff.workflowId,
        laneExecution: input.handoff.laneExecution,
        attentionTransition: input.handoff.attentionTransition,
        ...(input.handoff.postOutcomeAction ? { postOutcomeAction: input.handoff.postOutcomeAction } : {}),
        ...(input.handoff.nextDispatch ? { nextDispatch: input.handoff.nextDispatch } : {})
      };
      emitHarnessSpecificCommittedOutcomeEvent("wealth_factory_harness_lane_done", input.options.workerInstanceId, laneDoneHandoff);
      await input.options.onHarnessLaneDone?.(laneDoneHandoff);
      return;
    }
    case "waiting": {
      const laneWaitingHandoff = {
        tenantId: input.handoff.tenantId,
        runId: input.handoff.runId,
        workflowId: input.handoff.workflowId,
        laneExecution: input.handoff.laneExecution,
        attentionTransition: input.handoff.attentionTransition,
        ...(input.handoff.postOutcomeAction ? { postOutcomeAction: input.handoff.postOutcomeAction } : {})
      };
      emitHarnessSpecificCommittedOutcomeEvent("wealth_factory_harness_lane_waiting", input.options.workerInstanceId, laneWaitingHandoff);
      await input.options.onHarnessLaneWaiting?.(laneWaitingHandoff);
      return;
    }
    case "blocked": {
      const laneBlockedHandoff = {
        tenantId: input.handoff.tenantId,
        runId: input.handoff.runId,
        workflowId: input.handoff.workflowId,
        laneExecution: input.handoff.laneExecution,
        attentionTransition: input.handoff.attentionTransition,
        ...(input.handoff.postOutcomeAction ? { postOutcomeAction: input.handoff.postOutcomeAction } : {})
      };
      emitHarnessSpecificCommittedOutcomeEvent("wealth_factory_harness_lane_blocked", input.options.workerInstanceId, laneBlockedHandoff);
      await input.options.onHarnessLaneBlocked?.(laneBlockedHandoff);
      return;
    }
    case "cancelled": {
      const laneCancelledHandoff = {
        tenantId: input.handoff.tenantId,
        runId: input.handoff.runId,
        workflowId: input.handoff.workflowId,
        laneExecution: input.handoff.laneExecution,
        attentionTransition: input.handoff.attentionTransition,
        ...(input.handoff.postOutcomeAction ? { postOutcomeAction: input.handoff.postOutcomeAction } : {}),
        ...(input.handoff.nextDispatch ? { nextDispatch: input.handoff.nextDispatch } : {})
      };
      emitHarnessSpecificCommittedOutcomeEvent("wealth_factory_harness_lane_cancelled", input.options.workerInstanceId, laneCancelledHandoff);
      await input.options.onHarnessLaneCancelled?.(laneCancelledHandoff);
      return;
    }
  }
}

function emitHarnessSpecificCommittedOutcomeEvent(
  type:
    | "wealth_factory_harness_lane_done"
    | "wealth_factory_harness_lane_waiting"
    | "wealth_factory_harness_lane_blocked"
    | "wealth_factory_harness_lane_cancelled",
  workerInstanceId: string | undefined,
  payload: {
    tenantId: string;
    runId: string;
    workflowId: string;
    laneExecution: NonNullable<HarnessWorkerLaneOutcome["laneExecution"]>;
    attentionTransition: HarnessWorkerLaneAttentionTransition;
    postOutcomeAction?: HarnessWorkerLaneOutcome["postOutcomeAction"];
    nextDispatch?: HarnessWorkerLaneOutcome["nextDispatch"];
  }
) {
  process.stdout.write(
    `${JSON.stringify({
      type,
      workerInstanceId: workerInstanceId ?? "worker",
      observedAt: new Date().toISOString(),
      ...payload
    })}\n`
  );
}

async function runSpecificPostOutcomeHandler(input: {
  options: {
    workerInstanceId?: string;
    onHarnessCeoReviewRequested?: (input: {
      tenantId: string;
      runId: string;
      workflowId: string;
      action: Extract<Exclude<HarnessPostOutcomeAction, { kind: "dispatch_next_lane" }>, { kind: "queue_ceo_review" }>;
      laneExecution: NonNullable<HarnessWorkerLaneOutcome["laneExecution"]>;
    }) => void | Promise<void>;
    onHarnessLaneResumeAwaited?: (input: {
      tenantId: string;
      runId: string;
      workflowId: string;
      action: Extract<Exclude<HarnessPostOutcomeAction, { kind: "dispatch_next_lane" }>, { kind: "await_lane_resume" }>;
      laneExecution: NonNullable<HarnessWorkerLaneOutcome["laneExecution"]>;
    }) => void | Promise<void>;
    onHarnessLaneUnblockAwaited?: (input: {
      tenantId: string;
      runId: string;
      workflowId: string;
      action: Extract<Exclude<HarnessPostOutcomeAction, { kind: "dispatch_next_lane" }>, { kind: "await_unblock" }>;
      laneExecution: NonNullable<HarnessWorkerLaneOutcome["laneExecution"]>;
    }) => void | Promise<void>;
  };
  handoff: {
    tenantId: string;
    runId: string;
    workflowId: string;
    action: Exclude<HarnessPostOutcomeAction, { kind: "dispatch_next_lane" }>;
    laneExecution: NonNullable<HarnessWorkerLaneOutcome["laneExecution"]>;
  };
}) {
  switch (input.handoff.action.kind) {
    case "queue_ceo_review": {
      const ceoReviewHandoff = {
        tenantId: input.handoff.tenantId,
        runId: input.handoff.runId,
        workflowId: input.handoff.workflowId,
        action: input.handoff.action,
        laneExecution: input.handoff.laneExecution
      };
      emitHarnessSpecificPostOutcomeEvent(
        "wealth_factory_harness_ceo_review_requested",
        input.options.workerInstanceId,
        ceoReviewHandoff
      );
      await input.options.onHarnessCeoReviewRequested?.(ceoReviewHandoff);
      return;
    }
    case "await_lane_resume": {
      const laneResumeHandoff = {
        tenantId: input.handoff.tenantId,
        runId: input.handoff.runId,
        workflowId: input.handoff.workflowId,
        action: input.handoff.action,
        laneExecution: input.handoff.laneExecution
      };
      emitHarnessSpecificPostOutcomeEvent(
        "wealth_factory_harness_lane_resume_awaited",
        input.options.workerInstanceId,
        laneResumeHandoff
      );
      await input.options.onHarnessLaneResumeAwaited?.(laneResumeHandoff);
      return;
    }
    case "await_unblock": {
      const laneUnblockHandoff = {
        tenantId: input.handoff.tenantId,
        runId: input.handoff.runId,
        workflowId: input.handoff.workflowId,
        action: input.handoff.action,
        laneExecution: input.handoff.laneExecution
      };
      emitHarnessSpecificPostOutcomeEvent(
        "wealth_factory_harness_lane_unblock_awaited",
        input.options.workerInstanceId,
        laneUnblockHandoff
      );
      await input.options.onHarnessLaneUnblockAwaited?.(laneUnblockHandoff);
      return;
    }
  }
}

function emitHarnessSpecificPostOutcomeEvent(
  type:
    | "wealth_factory_harness_ceo_review_requested"
    | "wealth_factory_harness_lane_resume_awaited"
    | "wealth_factory_harness_lane_unblock_awaited",
  workerInstanceId: string | undefined,
  payload: {
    tenantId: string;
    runId: string;
    workflowId: string;
    action: Exclude<HarnessPostOutcomeAction, { kind: "dispatch_next_lane" }>;
    laneExecution: NonNullable<HarnessWorkerLaneOutcome["laneExecution"]>;
  }
) {
  process.stdout.write(
    `${JSON.stringify({
      type,
      workerInstanceId: workerInstanceId ?? "worker",
      observedAt: new Date().toISOString(),
      ...payload
    })}\n`
  );
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
    | "listEventsForRun"
    | "listProposalsForRun"
    | "listCardContinuityForRun"
    | "claimCardForExecution"
    | "refreshCardExecutionClaim"
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
        | "listEventsForRun"
        | "listProposalsForRun"
        | "listCardContinuityForRun"
        | "claimCardForExecution"
        | "refreshCardExecutionClaim"
        | "transitionCardState"
        | "insertEvent"
        | "upsertCardContinuity"
        | "updateRunState"
      >
    ) => Promise<T>
  ) => Promise<T>;
  workflowRegistry: Pick<ReturnType<typeof createHarnessWorkflowRegistry>, "getDefinition">;
  recordStatus?: (status: { tenantId: string; runId: string; workflowId: string; status: "queued" | "running" | "failed" }) => void | Promise<void>;
  onDispatch?: (dispatch: HarnessWorkerDispatch) => void;
  onExecutionEnvelope?: (envelope: HarnessWorkerExecutionEnvelope) => void | Promise<void>;
}) {
  try {
    const dispatchResolution = await buildHarnessWorkerDispatchResolution({
      repository: options.repository,
      tenantId: options.payload.tenantId,
      runId: options.payload.runId,
      workflowId: options.payload.workflowId,
      ...(options.runAtomically ? { runAtomically: options.runAtomically } : {})
    });
    const dispatch = dispatchResolution.dispatch;
    if (dispatch.laneExecution) {
      const executionEnvelope = await buildHarnessWorkerExecutionEnvelope({
        repository: options.repository,
        tenantId: options.payload.tenantId,
        dispatch,
        requiredCapabilities: options.workflowRegistry.getDefinition(dispatch.workflowId).requiredCapabilities,
        ...(dispatchResolution.executionClaim ? { executionClaimContext: dispatchResolution.executionClaim } : {})
      });
      if (executionEnvelope) {
        try {
          await options.onExecutionEnvelope?.(executionEnvelope);
        } catch (error) {
          console.warn("Harness lane-ready hook failed after durable lane claim", {
            runId: executionEnvelope.runId,
            workflowId: executionEnvelope.workflowId,
            cardId: executionEnvelope.laneExecution.cardId,
            error: error instanceof Error ? { name: error.name, message: error.message } : { message: String(error) }
          });
        }
      }
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
    executionClaimToken?: string;
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
    | "listEventsForRun"
    | "listProposalsForRun"
    | "listCardContinuityForRun"
    | "claimCardForExecution"
    | "refreshCardExecutionClaim"
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
        | "listEventsForRun"
        | "listProposalsForRun"
        | "listCardContinuityForRun"
        | "claimCardForExecution"
        | "refreshCardExecutionClaim"
        | "transitionCardState"
        | "insertEvent"
        | "upsertCardContinuity"
        | "updateRunState"
      >
    ) => Promise<T>
  ) => Promise<T>;
  recordStatus?: (status: { tenantId: string; runId: string; workflowId: string; status: PaperclipRunStatus }) => void | Promise<void>;
  onOutcome?: (outcome: HarnessWorkerLaneOutcome) => void | Promise<void>;
}) {
  const outcome = await commitHarnessWorkerLaneOutcome({
    repository: options.repository,
    tenantId: options.payload.tenantId,
    runId: options.payload.runId,
    workflowId: options.payload.workflowId,
    cardId: options.payload.cardId,
    ...(options.payload.executionClaimToken ? { executionClaimToken: options.payload.executionClaimToken } : {}),
    state: options.payload.state,
    ...(options.payload.resultSummary ? { resultSummary: options.payload.resultSummary } : {}),
    ...(options.payload.resumeSummary ? { resumeSummary: options.payload.resumeSummary } : {}),
    ...(options.runAtomically ? { runAtomically: options.runAtomically } : {})
  });
  if (outcome.status === "committed") {
    const workflowStatus = deriveHarnessWorkflowStatusFromOutcome(outcome);
    if (workflowStatus) {
      await options.recordStatus?.({
        tenantId: options.payload.tenantId,
        runId: outcome.runId,
        workflowId: outcome.workflowId,
        status: workflowStatus
      });
    }
  }
  await options.onOutcome?.(outcome);
  return outcome;
}

function deriveHarnessWorkflowStatusFromOutcome(outcome: HarnessWorkerLaneOutcome): PaperclipRunStatus | null {
  if (outcome.status !== "committed") {
    return null;
  }
  if (outcome.nextDispatch?.laneExecution) {
    return "running";
  }

  switch (outcome.laneExecution?.runState) {
    case "done":
      return "completed";
    case "failed":
      return "failed";
    case "cancelled":
      return "cancelled";
    case "active":
    case "waiting":
    case "blocked":
    case "assembling":
      return "queued";
    default:
      return null;
  }
}
