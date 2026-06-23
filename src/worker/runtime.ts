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
  type HarnessWorkerDispatchHandoff,
  type HarnessWorkerDispatch,
  type HarnessWorkerExecutionClaimContext,
  type HarnessWorkerLaneAttentionTransition,
  type HarnessWorkerExecutionEnvelope,
  type HarnessWorkerLaneOutcome
} from "../harness/worker-executor.js";
import { type HarnessPostOutcomeAction } from "../harness/post-outcome.js";
import { createPostgresHarnessRepository } from "../harness/repository.js";
import { listInstalledPackageDefinitions } from "../packages/package-catalog.js";
import type { ProviderCapability } from "../packages/package-types.js";
import type { PaperclipRunStatus } from "../paperclip/types.js";
import { createRuntimeProviderExecutionContextResolver } from "../providers/runtime-provider-execution.js";
import type { RuntimeProviderExecutionBinding } from "../providers/runtime-provider-execution.js";
import type { RuntimeProviderBinding } from "../providers/runtime-provider-resolution.js";
import { createEncryptedSecretVault } from "../secrets/encrypted-vault.js";
import { createPostgresEncryptedVaultStore } from "../secrets/postgres-vault-store.js";
import { createSecretService } from "../secrets/secret-service.js";
import { createHarnessWorkflowRegistry } from "../wealthfactory/workflow-registry.js";
import { validateWorkflowQueuePayload } from "../workflows/queue.js";
import { createAcidWorkflowStatusRecorder } from "../workflows/acid-status-recorder.js";
import { createTenantExecutionGate } from "./tenant-execution-gate.js";
import { WorkerRuntimeClosingError } from "./runtime-closing-error.js";
import { createDefaultNativeExecutor, type NativeExecutionOutcome, type NativeExecutor } from "./native-executor.js";
import { executeNativeHarnessLane } from "./runtime-native-execution.js";
import { createHarnessCardEventRecord } from "../harness/types.js";

export type WorkerEnv = ReturnType<typeof loadWorkerEnv>;
type HarnessFollowOnDispatchHandoff = Extract<HarnessWorkerDispatchHandoff, { kind: "follow_on_dispatch" }>;
type HarnessReactivatedFollowOnDispatchHandoff = HarnessFollowOnDispatchHandoff & { reactivatedRun: true };

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
  runtimeCloseDrainTimeoutMs?: number;
  onHarnessLaneReady?: (envelope: HarnessWorkerExecutionEnvelope) => void | Promise<void>;
  onHarnessExecutionStartSuppressed?: (input: {
    tenantId: string;
    runId: string;
    workflowId: string;
    dispatchHandoff: HarnessWorkerDispatchHandoff;
    laneExecution: HarnessWorkerDispatch["laneExecution"] extends infer T ? Exclude<T, null> : never;
    executionClaim?: HarnessWorkerExecutionClaimContext;
    failure: {
      kind: "execution_envelope_reconstruction_failed";
      message: string;
    };
  }) => void | Promise<void>;
  onHarnessInitialLaneStartSuppressed?: (input: {
    tenantId: string;
    runId: string;
    workflowId: string;
    dispatchHandoff: Extract<HarnessWorkerDispatchHandoff, { kind: "initial_claim" }>;
    laneExecution: HarnessWorkerDispatch["laneExecution"] extends infer T ? Exclude<T, null> : never;
    executionClaim?: HarnessWorkerExecutionClaimContext;
    failure: {
      kind: "execution_envelope_reconstruction_failed";
      message: string;
    };
  }) => void | Promise<void>;
  onHarnessFollowOnDispatchSuppressed?: (input: {
    tenantId: string;
    runId: string;
    workflowId: string;
    dispatchHandoff: Extract<HarnessWorkerDispatchHandoff, { kind: "follow_on_dispatch" }>;
    laneExecution: HarnessWorkerDispatch["laneExecution"] extends infer T ? Exclude<T, null> : never;
    executionClaim?: HarnessWorkerExecutionClaimContext;
    failure: {
      kind: "execution_envelope_reconstruction_failed";
      message: string;
    };
  }) => void | Promise<void>;
  onHarnessReactivatedFollowOnDispatchSuppressed?: (input: {
    tenantId: string;
    runId: string;
    workflowId: string;
    dispatchHandoff: HarnessReactivatedFollowOnDispatchHandoff;
    laneExecution: HarnessWorkerDispatch["laneExecution"] extends infer T ? Exclude<T, null> : never;
    executionClaim?: HarnessWorkerExecutionClaimContext;
    failure: {
      kind: "execution_envelope_reconstruction_failed";
      message: string;
    };
  }) => void | Promise<void>;
  onHarnessExecutionClaimed?: (input: {
    tenantId: string;
    runId: string;
    workflowId: string;
    executionClaim: HarnessWorkerExecutionClaimContext;
    laneExecution: HarnessWorkerExecutionEnvelope["laneExecution"];
  }) => void | Promise<void>;
  onHarnessApprovedExecutionClaim?: (input: {
    tenantId: string;
    runId: string;
    workflowId: string;
    executionClaim: Extract<HarnessWorkerExecutionClaimContext, { kind: "approved_claim" }>;
    laneExecution: HarnessWorkerExecutionEnvelope["laneExecution"];
  }) => void | Promise<void>;
  onHarnessRecoveredExecutionClaim?: (input: {
    tenantId: string;
    runId: string;
    workflowId: string;
    executionClaim: Extract<HarnessWorkerExecutionClaimContext, { kind: "working_claim_refresh" }>;
    laneExecution: HarnessWorkerExecutionEnvelope["laneExecution"];
  }) => void | Promise<void>;
  onHarnessExistingWorkingExecutionClaim?: (input: {
    tenantId: string;
    runId: string;
    workflowId: string;
    executionClaim: Extract<HarnessWorkerExecutionClaimContext, { kind: "existing_working_claim" }>;
    laneExecution: HarnessWorkerExecutionEnvelope["laneExecution"];
  }) => void | Promise<void>;
  onHarnessExecutionDispatched?: (input: {
    tenantId: string;
    runId: string;
    workflowId: string;
    dispatchHandoff: HarnessWorkerDispatchHandoff;
    laneExecution: HarnessWorkerExecutionEnvelope["laneExecution"];
  }) => void | Promise<void>;
  onHarnessInitialLaneStart?: (input: {
    tenantId: string;
    runId: string;
    workflowId: string;
    dispatchHandoff: Extract<HarnessWorkerDispatchHandoff, { kind: "initial_claim" }>;
    laneExecution: HarnessWorkerExecutionEnvelope["laneExecution"];
  }) => void | Promise<void>;
  onHarnessFollowOnDispatch?: (input: {
    tenantId: string;
    runId: string;
    workflowId: string;
    dispatchHandoff: Extract<HarnessWorkerDispatchHandoff, { kind: "follow_on_dispatch" }>;
    laneExecution: HarnessWorkerExecutionEnvelope["laneExecution"];
  }) => void | Promise<void>;
  onHarnessReactivatedFollowOnDispatch?: (input: {
    tenantId: string;
    runId: string;
    workflowId: string;
    dispatchHandoff: HarnessReactivatedFollowOnDispatchHandoff;
    laneExecution: HarnessWorkerExecutionEnvelope["laneExecution"];
  }) => void | Promise<void>;
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
  onHarnessLaneOutcomeIgnoredStaleClaim?: (input: {
    tenantId: string;
    runId: string;
    workflowId: string;
    cardId: string;
    ignored: NonNullable<Extract<HarnessWorkerLaneOutcome["ignored"], { reason: "stale_execution_claim" }>>;
  }) => void | Promise<void>;
  onHarnessLaneOutcomeIgnoredLaneNotWorking?: (input: {
    tenantId: string;
    runId: string;
    workflowId: string;
    cardId: string;
    ignored: NonNullable<Extract<HarnessWorkerLaneOutcome["ignored"], { reason: "lane_not_working" }>>;
  }) => void | Promise<void>;
  onHarnessLaneOutcomeIgnoredTerminalRun?: (input: {
    tenantId: string;
    runId: string;
    workflowId: string;
    cardId: string;
    ignored: NonNullable<Extract<HarnessWorkerLaneOutcome["ignored"], { reason: "terminal_run" }>>;
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
  onHarnessPostOutcomeActionReasserted?: (input: {
    tenantId: string;
    runId: string;
    workflowId: string;
    attentionDelivery: "reasserted";
    action: Exclude<HarnessPostOutcomeAction, { kind: "dispatch_next_lane" }>;
    laneExecution: NonNullable<HarnessWorkerLaneOutcome["laneExecution"]>;
  }) => void | Promise<void>;
  nativeExecutor?: NativeExecutor;
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
    harnessEnabledWorkflowIds: options.env.harnessEnabledWorkflowIds,
    nativeExecutorEnabledWorkflowIds: options.env.nativeExecutorEnabledWorkflowIds
  });
  const tenantWorkflowRegistryCache = new Map<string, Promise<ReturnType<typeof createHarnessWorkflowRegistry>>>();
  const nativeExecutor = options.nativeExecutor ?? createDefaultNativeExecutor({
    openAIModel: options.env.nativeOpenAIModel
  });
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
  const inFlightRuntimeOperations = new Set<Promise<unknown>>();
  let isClosing = false;
  let closingPromise: Promise<void> | null = null;
  const runtimeCloseDrainTimeoutMs = Math.max(0, options.runtimeCloseDrainTimeoutMs ?? 5_000);

  function trackRuntimeOperation<T>(promise: Promise<T>): Promise<T> {
    const tracked = promise.finally(() => {
      inFlightRuntimeOperations.delete(tracked);
    });
    inFlightRuntimeOperations.add(tracked);
    return tracked;
  }

  function resolveHarnessWorkflowRegistryForTenant(tenantId: string) {
    const cached = tenantWorkflowRegistryCache.get(tenantId);
    if (cached) {
      return cached;
    }

    const registryPromise = repositories
      .listActiveInstalledPackageIds({ tenantId })
      .then((installedPackageIds) =>
        createHarnessWorkflowRegistry({
          harnessEnabledWorkflowIds: options.env.harnessEnabledWorkflowIds,
          nativeExecutorEnabledWorkflowIds: options.env.nativeExecutorEnabledWorkflowIds,
          installedPackages: listInstalledPackageDefinitions({ installedPackageIds })
        })
      )
      .finally(() => {
        tenantWorkflowRegistryCache.delete(tenantId);
      });
    tenantWorkflowRegistryCache.set(tenantId, registryPromise);
    return registryPromise;
  }

  async function resolveHarnessWorkflowRegistryForRun(
    input: { tenantId: string; runId: string },
    workflowIdentity: Awaited<ReturnType<typeof acidRepository.getWorkflowRunIdentity>> | null = null
  ) {
    const resolvedWorkflowIdentity = workflowIdentity ?? await acidRepository.getWorkflowRunIdentity(input);
    if (
      resolvedWorkflowIdentity?.workflowIdentityKind === "installed_package_overlay"
      && resolvedWorkflowIdentity.workflowPackageId
    ) {
      const snapshot = resolvedWorkflowIdentity.workflowDefinitionSnapshot;
      const registry = createHarnessWorkflowRegistry({
        harnessEnabledWorkflowIds: options.env.harnessEnabledWorkflowIds,
        nativeExecutorEnabledWorkflowIds: options.env.nativeExecutorEnabledWorkflowIds,
        installedPackages: listInstalledPackageDefinitions({
          installedPackageIds: [snapshot?.packageId ?? resolvedWorkflowIdentity.workflowPackageId]
        })
      });
      if (!snapshot) {
        throw new Error(`Stored workflow definition snapshot missing for overlay workflow ${resolvedWorkflowIdentity.workflowId}`);
      }
      const definition = registry.getDefinition(resolvedWorkflowIdentity.workflowId);
      if (
        definition.packageId !== snapshot.packageId ||
        (definition.executionEngine ?? "paperclip") !== snapshot.executionEngine ||
        JSON.stringify([...definition.requiredCapabilities]) !== JSON.stringify([...snapshot.requiredCapabilities]) ||
        (definition.providerKind ?? null) !== (snapshot.providerKind ?? null)
      ) {
        throw new Error(`Stored workflow definition snapshot no longer matches the current overlay catalog for ${resolvedWorkflowIdentity.workflowId}`);
      }
      return registry;
    }

    return resolveHarnessWorkflowRegistryForTenant(input.tenantId);
  }

  async function waitForInFlightRuntimeOperations(): Promise<"drained" | "timed_out"> {
    const deadline = Date.now() + runtimeCloseDrainTimeoutMs;
    while (inFlightRuntimeOperations.size > 0) {
      const remainingMs = deadline - Date.now();
      if (remainingMs <= 0) {
        return "timed_out";
      }
      const snapshot = [...inFlightRuntimeOperations];
      await Promise.race([
        Promise.allSettled(snapshot),
        new Promise<"timed_out">((resolve) => {
          setTimeout(() => resolve("timed_out"), remainingMs);
        })
      ]);
    }
    return "drained";
  }

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

  const runtimeApi = {
    async processQueuePayload(payload: unknown) {
      if (isClosing) {
        throw new WorkerRuntimeClosingError();
      }
      const validatedPayload = validateWorkflowQueuePayload(payload);
      const workflowIdentity = await acidRepository.getWorkflowRunIdentity({
        tenantId: validatedPayload.tenantId,
        runId: validatedPayload.runId
      });
      const tenantHarnessWorkflowRegistry = await resolveHarnessWorkflowRegistryForRun({
        tenantId: validatedPayload.tenantId,
        runId: validatedPayload.runId
      }, workflowIdentity);
      if (
        workflowIdentity?.workflowIdentityKind === "tenant_template"
        && workflowIdentity.workflowTemplateId
        && validatedPayload.workflowId !== workflowIdentity.workflowId
        && validatedPayload.workflowId !== workflowIdentity.workflowTemplateId
      ) {
        throw new Error(
          `Queued workflow id ${validatedPayload.workflowId} does not match durable tenant-template identity for run ${validatedPayload.runId}`
        );
      }
      const routedWorkflowId =
        workflowIdentity?.workflowId
        && workflowIdentity.workflowIdentityKind === "tenant_template"
        && workflowIdentity.workflowTemplateId === validatedPayload.workflowId
        && workflowIdentity.workflowId !== validatedPayload.workflowId
        && resolveWorkerExecutionEngine(workflowIdentity.workflowId, tenantHarnessWorkflowRegistry) === "wf_native_v1"
          ? workflowIdentity.workflowId
          : validatedPayload.workflowId;
      const routedPayload =
        routedWorkflowId === validatedPayload.workflowId
          ? validatedPayload
          : {
              ...validatedPayload,
              workflowId: routedWorkflowId
            };
      if (
        workflowIdentity?.workflowId
        && resolveWorkerExecutionEngine(workflowIdentity.workflowId, tenantHarnessWorkflowRegistry) === "paperclip"
      ) {
        throw new Error(
          `Durable workflow identity ${workflowIdentity.workflowId} is not mapped to a supported native or harness execution engine`
        );
      }
      const workerExecutionEngine = resolveWorkerExecutionEngine(
        routedPayload.workflowId,
        tenantHarnessWorkflowRegistry
      );
      if (
        !workflowIdentity
        && workerExecutionEngine === "paperclip"
      ) {
        throw new Error(
          `Legacy Paperclip execution adapter has been retired for workflow id ${routedPayload.workflowId}`
        );
      }

      return executionGate.run({
        tenantId: validatedPayload.tenantId,
        onStarted: (snapshot) => emitWorkerRunEvent("started", routedPayload, snapshot, workerExecutionEngine),
        onReleased: (snapshot) => emitWorkerRunEvent("released", routedPayload, snapshot, workerExecutionEngine),
        operation: async () => {
          if (isClosing) {
            throw new WorkerRuntimeClosingError();
          }
          const workflowDefinition = tenantHarnessWorkflowRegistry.isHarnessEligible(routedPayload.workflowId)
            ? tenantHarnessWorkflowRegistry.getDefinition(routedPayload.workflowId)
            : null;
          const harnessExecutionEngine =
            workflowDefinition?.executionEngine === "wf_native_v1"
              ? "wf_native_v1"
              : workflowDefinition?.executionEngine === "wf_harness_v1"
                ? "wf_harness_v1"
                : null;
          if (!workflowDefinition || !harnessExecutionEngine) {
            throw new Error(`Harness workflow definition is required for runtime execution: ${routedPayload.workflowId}`);
          }

          return trackRuntimeOperation(
            processHarnessWorkflowJob({
                payload: routedPayload,
                repository: harnessRepository,
                runAtomically: (work) =>
                  transactionRunner.withTransaction((transaction) =>
                    work(createPostgresHarnessRepository(transaction))
                  ),
                workflowRegistry: tenantHarnessWorkflowRegistry,
                executionEngine: harnessExecutionEngine,
                recordStatus: async (status) => {
                  await recordWorkflowStatus(status);
                },
                loadBoundProviderContext: async ({ tenantId, runId }) => {
                  const binding = await acidRepository.getBoundProviderLaunchBinding({ tenantId, runId });
                  return binding ? ([binding] as readonly RuntimeProviderBinding[]) : null;
                },
                hydrateProviderContext: async ({ tenantId, runId, workflowId, providerBindings }) =>
                  providerExecutionResolver.resolveForRun({
                    tenantId,
                    runId,
                    workflowId,
                    providerBindings
                  }),
                ...(options.workerInstanceId ? { workerInstanceId: options.workerInstanceId } : {}),
                ...(harnessExecutionEngine === "wf_native_v1"
                  ? {
                      nativeExecutor,
                      commitNativeOutcome: async (nativeInput: {
                        tenantId: string;
                        runId: string;
                        workflowId: string;
                        cardId: string;
                        executionClaimToken?: string;
                        outcome: NativeExecutionOutcome;
                      }) => commitHarnessLaneOutcomeInternal(
                        {
                          tenantId: nativeInput.tenantId,
                          runId: nativeInput.runId,
                          workflowId: nativeInput.workflowId,
                          cardId: nativeInput.cardId,
                          ...(nativeInput.executionClaimToken ? { executionClaimToken: nativeInput.executionClaimToken } : {}),
                          state: nativeInput.outcome.state,
                          ...(nativeInput.outcome.resultSummary ? { resultSummary: nativeInput.outcome.resultSummary } : {}),
                          ...(nativeInput.outcome.resumeSummary ? { resumeSummary: nativeInput.outcome.resumeSummary } : {})
                        },
                        { allowDuringClose: true }
                      )
                    }
                  : {}),
                ...(options.onHarnessExecutionStartSuppressed
                  ? { onHarnessExecutionStartSuppressed: options.onHarnessExecutionStartSuppressed }
                  : {}),
                ...(options.onHarnessInitialLaneStartSuppressed
                  ? { onHarnessInitialLaneStartSuppressed: options.onHarnessInitialLaneStartSuppressed }
                  : {}),
                ...(options.onHarnessFollowOnDispatchSuppressed
                  ? { onHarnessFollowOnDispatchSuppressed: options.onHarnessFollowOnDispatchSuppressed }
                  : {}),
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
                  : {}),
                onDispatchResolution: async ({ dispatch, executionClaim, executionEnvelope }) => {
                  await emitHarnessExecutionStartHandoffs({
                    repository: harnessRepository,
                    options,
                    ...(options.workerInstanceId ? { workerInstanceId: options.workerInstanceId } : {}),
                    tenantId: validatedPayload.tenantId,
                    workflowId: routedPayload.workflowId,
                    dispatch,
                    ...(executionClaim ? { executionClaim } : {}),
                    executionEnvelope
                  });
                }
              })
          );
        }
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
      return commitHarnessLaneOutcomeInternal(input, { allowDuringClose: false });
    },

    async close() {
      closingPromise ??= (async () => {
        isClosing = true;
        const drainStatus = await waitForInFlightRuntimeOperations();
        if (drainStatus === "timed_out") {
          console.warn("Worker runtime close timed out while waiting for in-flight operations", {
            timeoutMs: runtimeCloseDrainTimeoutMs,
            remainingInFlightOperations: inFlightRuntimeOperations.size
          });
        }
        await pool.end();
      })();
      await closingPromise;
    }
  };
  return runtimeApi;

  async function commitHarnessLaneOutcomeInternal(
    input: {
      tenantId: string;
      runId: string;
      workflowId: string;
      cardId: string;
      executionClaimToken?: string;
      state: "waiting" | "done" | "blocked" | "cancelled";
      resultSummary?: string;
      resumeSummary?: string;
    },
    commitOptions: {
      allowDuringClose: boolean;
    }
  ) {
    const tenantHarnessWorkflowRegistry = await resolveHarnessWorkflowRegistryForRun({
      tenantId: input.tenantId,
      runId: input.runId
    });
    if (!tenantHarnessWorkflowRegistry.isHarnessEligible(input.workflowId)) {
      throw new Error(`Harness lane outcome is not enabled for workflow ${input.workflowId}`);
    }

    if (isClosing && !commitOptions.allowDuringClose) {
      throw new WorkerRuntimeClosingError();
    }

    const outcome = await trackRuntimeOperation(processHarnessLaneOutcome({
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
              await persistExecutionHookFailure({
                repository: harnessRepository,
                cardId: input.cardId,
                hookFamily: "lane_outcome_ignored",
                hookFamilyLabel: "Ignored worker outcome handoff",
                deliveryMode: "generic",
                hookKind: "onHarnessLaneOutcomeIgnored",
                hookKindLabel: "Ignored worker outcome hook",
                reason: workerOutcome.ignored.reason,
                currentLaneState: "currentLaneState" in workerOutcome.ignored ? workerOutcome.ignored.currentLaneState : undefined,
                error
              });
              console.warn("Harness ignored-outcome hook failed after fail-closed worker rejection", {
                runId: workerOutcome.runId,
                workflowId: workerOutcome.workflowId,
                cardId: input.cardId,
                reason: workerOutcome.ignored.reason,
                error: error instanceof Error ? { name: error.name, message: error.message } : { message: String(error) }
              });
            }
            try {
              await runSpecificIgnoredOutcomeHandler({
                options,
                handoff: ignoredOutcomeHandoff
              });
            } catch (error) {
              await persistExecutionHookFailure({
                repository: harnessRepository,
                cardId: input.cardId,
                hookFamily: "lane_outcome_ignored",
                hookFamilyLabel: "Ignored worker outcome handoff",
                deliveryMode: "specific",
                hookKind: workerOutcome.ignored.reason,
                hookKindLabel: humanizeLabel(workerOutcome.ignored.reason),
                reason: workerOutcome.ignored.reason,
                currentLaneState: "currentLaneState" in workerOutcome.ignored ? workerOutcome.ignored.currentLaneState : undefined,
                error
              });
              console.warn("Harness specific ignored-outcome handler failed after fail-closed worker rejection", {
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
              await persistExecutionHookFailure({
                repository: harnessRepository,
                cardId: committedOutcome.laneExecution.cardId,
                hookFamily: "lane_outcome_committed",
                hookFamilyLabel: "Committed worker outcome handoff",
                deliveryMode: "generic",
                hookKind: "onHarnessLaneOutcomeCommitted",
                hookKindLabel: "Committed worker outcome hook",
                outcomeState: committedOutcome.laneExecution.state,
                error
              });
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
              await persistExecutionHookFailure({
                repository: harnessRepository,
                cardId: committedOutcome.laneExecution.cardId,
                hookFamily: "lane_outcome_committed",
                hookFamilyLabel: "Committed worker outcome handoff",
                deliveryMode: "specific",
                hookKind: committedOutcome.laneExecution.state,
                hookKindLabel: humanizeLabel(committedOutcome.laneExecution.state),
                outcomeState: committedOutcome.laneExecution.state,
                error
              });
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
              await persistExecutionHookFailure({
                repository: harnessRepository,
                cardId: committedOutcome.laneExecution.cardId,
                hookFamily: "attention_resolved",
                hookFamilyLabel: "Attention resolved handoff",
                deliveryMode: "generic",
                hookKind: "onHarnessAttentionResolved",
                hookKindLabel: "Attention resolved hook",
                actionKind: resolvedAttentionAction.kind,
                reason: "reason" in resolvedAttentionAction ? resolvedAttentionAction.reason : undefined,
                error
              });
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
          ) {
            const attentionDelivery =
              committedOutcome.attentionTransition?.kind === "unchanged" ? "reasserted" as const : "requested" as const;
            const postOutcomeHandoff = {
              tenantId: input.tenantId,
              runId: committedOutcome.runId,
              workflowId: committedOutcome.workflowId,
              attentionDelivery,
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
            if (attentionDelivery === "requested") {
              try {
                await options.onHarnessPostOutcomeAction?.(postOutcomeHandoff);
              } catch (error) {
                await persistExecutionHookFailure({
                  repository: harnessRepository,
                  cardId: committedOutcome.laneExecution.cardId,
                  hookFamily: "post_outcome_action",
                  hookFamilyLabel: "Post-outcome action handoff",
                  deliveryMode: "generic",
                  hookKind: "onHarnessPostOutcomeAction",
                  hookKindLabel: "Post-outcome action hook",
                  actionKind: committedOutcome.postOutcomeAction.kind,
                  attentionDelivery: "requested",
                  reason: "reason" in committedOutcome.postOutcomeAction ? committedOutcome.postOutcomeAction.reason : undefined,
                  outcomeState: committedOutcome.laneExecution.state,
                  error
                });
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
                await persistExecutionHookFailure({
                  repository: harnessRepository,
                  cardId: committedOutcome.laneExecution.cardId,
                  hookFamily: "post_outcome_action",
                  hookFamilyLabel: "Post-outcome action handoff",
                  deliveryMode: "specific",
                  hookKind: committedOutcome.postOutcomeAction.kind,
                  hookKindLabel: humanizeLabel(committedOutcome.postOutcomeAction.kind),
                  actionKind: committedOutcome.postOutcomeAction.kind,
                  attentionDelivery: "requested",
                  reason: "reason" in committedOutcome.postOutcomeAction ? committedOutcome.postOutcomeAction.reason : undefined,
                  outcomeState: committedOutcome.laneExecution.state,
                  error
                });
                console.warn("Harness specific post-outcome handler failed after durable worker outcome", {
                  runId: committedOutcome.runId,
                  workflowId: committedOutcome.workflowId,
                  cardId: committedOutcome.laneExecution.cardId,
                  actionKind: committedOutcome.postOutcomeAction.kind,
                  error: error instanceof Error ? { name: error.name, message: error.message } : { message: String(error) }
                });
              }
            } else {
              try {
                await options.onHarnessPostOutcomeActionReasserted?.({
                  ...postOutcomeHandoff,
                  attentionDelivery: "reasserted"
                });
              } catch (error) {
                await persistExecutionHookFailure({
                  repository: harnessRepository,
                  cardId: committedOutcome.laneExecution.cardId,
                  hookFamily: "post_outcome_action",
                  hookFamilyLabel: "Post-outcome action handoff",
                  deliveryMode: "generic",
                  hookKind: "onHarnessPostOutcomeActionReasserted",
                  hookKindLabel: "Post-outcome action reasserted hook",
                  actionKind: committedOutcome.postOutcomeAction.kind,
                  attentionDelivery: "reasserted",
                  reason: "reason" in committedOutcome.postOutcomeAction ? committedOutcome.postOutcomeAction.reason : undefined,
                  outcomeState: committedOutcome.laneExecution.state,
                  error
                });
                console.warn("Harness reasserted post-outcome hook failed after durable worker outcome", {
                  runId: committedOutcome.runId,
                  workflowId: committedOutcome.workflowId,
                  cardId: committedOutcome.laneExecution.cardId,
                  actionKind: committedOutcome.postOutcomeAction.kind,
                  error: error instanceof Error ? { name: error.name, message: error.message } : { message: String(error) }
                });
              }
            }
          }
          if (committedOutcome.nextDispatch?.laneExecution) {
            let executionEnvelope: HarnessWorkerExecutionEnvelope | null = null;
            try {
              const tenantHarnessWorkflowRegistry = await resolveHarnessWorkflowRegistryForRun({
                tenantId: input.tenantId,
                runId: input.runId
              });
              executionEnvelope = await buildHarnessWorkerExecutionEnvelope({
                repository: harnessRepository,
                tenantId: input.tenantId,
                dispatch: committedOutcome.nextDispatch,
                requiredCapabilities: tenantHarnessWorkflowRegistry.getDefinition(committedOutcome.nextDispatch.workflowId)
                  .requiredCapabilities,
                ...(committedOutcome.nextExecutionStartContext?.lane
                  ? { laneContext: committedOutcome.nextExecutionStartContext.lane }
                  : {}),
                ...(committedOutcome.nextExecutionStartContext?.executionClaim
                  ? { executionClaimContext: committedOutcome.nextExecutionStartContext.executionClaim }
                  : {})
              });
            } catch (error) {
              const failureMessage = error instanceof Error ? error.message : String(error);
              await harnessRepository.insertEvent(
                createHarnessCardEventRecord({
                  cardId: committedOutcome.nextDispatch.laneExecution.cardId,
                  eventKind: "execution_start_suppressed",
                  payload: toExecutionStartEventPayload({
                    dispatchHandoff: committedOutcome.nextDispatch.dispatchHandoff ?? {
                      kind: "follow_on_dispatch",
                      kindLabel: "Follow-on dispatch",
                      executionStage: "post_outcome_follow_on",
                      executionStageLabel: "Post-outcome follow-on",
                      reactivatedRun: false,
                      triggeredByCardId: committedOutcome.laneExecution!.cardId,
                      triggeredByPersona: "unknown",
                      triggeredByOutcomeState: committedOutcome.laneExecution!.state as "waiting" | "done" | "blocked" | "cancelled"
                    },
                    ...(committedOutcome.nextExecutionStartContext?.executionClaim
                      ? { executionClaim: committedOutcome.nextExecutionStartContext.executionClaim }
                      : {}),
                    failureMessage
                  })
                })
              );
              console.warn("Harness follow-on execution envelope reconstruction failed after durable dispatch", {
                runId: committedOutcome.runId,
                workflowId: committedOutcome.workflowId,
                cardId: committedOutcome.nextDispatch.laneExecution.cardId,
                error: error instanceof Error ? { name: error.name, message: error.message } : { message: String(error) }
              });
              await emitHarnessExecutionStartSuppressed({
                repository: harnessRepository,
                options,
                ...(options.workerInstanceId ? { workerInstanceId: options.workerInstanceId } : {}),
                tenantId: input.tenantId,
                runId: committedOutcome.runId,
                workflowId: committedOutcome.nextDispatch.workflowId,
                  dispatchHandoff: committedOutcome.nextDispatch.dispatchHandoff ?? {
                    kind: "follow_on_dispatch",
                    kindLabel: "Follow-on dispatch",
                    executionStage: "post_outcome_follow_on",
                    executionStageLabel: "Post-outcome follow-on",
                    reactivatedRun: false,
                    triggeredByCardId: committedOutcome.laneExecution!.cardId,
                    triggeredByPersona: "unknown",
                    triggeredByOutcomeState: committedOutcome.laneExecution!.state as "waiting" | "done" | "blocked" | "cancelled"
                  },
                laneExecution: committedOutcome.nextDispatch.laneExecution,
                ...(committedOutcome.nextExecutionStartContext?.executionClaim
                  ? { executionClaim: committedOutcome.nextExecutionStartContext.executionClaim }
                  : {}),
                failureMessage
              });
            }
            if (executionEnvelope) {
              await harnessRepository.insertEvent(
                createHarnessCardEventRecord({
                  cardId: executionEnvelope.laneExecution.cardId,
                  eventKind: "execution_start_ready",
                  payload: toExecutionStartEventPayload({
                    dispatchHandoff: executionEnvelope.dispatchHandoff ?? {
                      kind: "follow_on_dispatch",
                      kindLabel: "Follow-on dispatch",
                      executionStage: "post_outcome_follow_on",
                      executionStageLabel: "Post-outcome follow-on",
                      reactivatedRun: false,
                      triggeredByCardId: committedOutcome.laneExecution!.cardId,
                      triggeredByPersona: "unknown",
                      triggeredByOutcomeState: committedOutcome.laneExecution!.state as "waiting" | "done" | "blocked" | "cancelled"
                    },
                    executionClaim: {
                      kind: executionEnvelope.executionClaim.kind,
                      claimedAt: executionEnvelope.executionClaim.claimedAt,
                      previousClaimedAt: executionEnvelope.executionClaim.previousClaimedAt
                    }
                  })
                })
              );
              try {
                await options.onHarnessLaneReady?.(executionEnvelope);
              } catch (error) {
                await persistExecutionHookFailure({
                  repository: harnessRepository,
                  cardId: executionEnvelope.laneExecution.cardId,
                  hookFamily: "execution_start_ready",
                  hookFamilyLabel: "Execution start ready handoff",
                  deliveryMode: "generic",
                  hookKind: "onHarnessLaneReady",
                  hookKindLabel: "Lane-ready hook",
                  dispatchKind: committedOutcome.nextDispatch.dispatchHandoff?.kind,
                  executionStage: committedOutcome.nextDispatch.dispatchHandoff?.executionStage,
                  claimKind: executionEnvelope.executionClaim.kind,
                  error
                });
                console.warn("Harness lane-ready hook failed after durable follow-on dispatch", {
                  runId: executionEnvelope.runId,
                  workflowId: executionEnvelope.workflowId,
                  cardId: executionEnvelope.laneExecution.cardId,
                  error: error instanceof Error ? { name: error.name, message: error.message } : { message: String(error) }
                });
              }
              await emitHarnessExecutionStartHandoffs({
                repository: harnessRepository,
                options,
                ...(options.workerInstanceId ? { workerInstanceId: options.workerInstanceId } : {}),
                tenantId: input.tenantId,
                workflowId: committedOutcome.nextDispatch.workflowId,
                dispatch: committedOutcome.nextDispatch,
                executionClaim: {
                  kind: executionEnvelope.executionClaim.kind,
                  claimedAt: executionEnvelope.executionClaim.claimedAt,
                  previousClaimedAt: executionEnvelope.executionClaim.previousClaimedAt
                },
                executionEnvelope
              });
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
      }));
    return outcome;
  }

  function resolveWorkerExecutionEngine(
    workflowId: string,
    workflowRegistry: ReturnType<typeof createHarnessWorkflowRegistry> = harnessWorkflowRegistry
  ): "paperclip" | "wf_harness_v1" | "wf_native_v1" {
    if (!workflowRegistry.isHarnessEligible(workflowId)) {
      return "paperclip";
    }

    return workflowRegistry.getDefinition(workflowId).executionEngine ?? "paperclip";
  }

  function emitWorkerRunEvent(
    event: "started" | "released",
    payload: { tenantId: string; runId: string; workflowId: string },
    snapshot: { activeRuns: number; activeByTenant: Record<string, number>; queuedByTenant: Record<string, number> },
    executionEngine: "paperclip" | "wf_harness_v1" | "wf_native_v1"
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
        executionEngine,
        execution: snapshot
      })}\n`
    );
  }
}

async function emitHarnessExecutionStartSuppressed(input: {
  repository: Pick<ReturnType<typeof createPostgresHarnessRepository>, "insertEvent">;
  options: {
    workerInstanceId?: string;
    onHarnessExecutionStartSuppressed?: (input: {
      tenantId: string;
      runId: string;
      workflowId: string;
      dispatchHandoff: HarnessWorkerDispatchHandoff;
      laneExecution: Exclude<HarnessWorkerDispatch["laneExecution"], null>;
      executionClaim?: HarnessWorkerExecutionClaimContext;
      failure: {
        kind: "execution_envelope_reconstruction_failed";
        message: string;
      };
    }) => void | Promise<void>;
    onHarnessInitialLaneStartSuppressed?: (input: {
      tenantId: string;
      runId: string;
      workflowId: string;
      dispatchHandoff: Extract<HarnessWorkerDispatchHandoff, { kind: "initial_claim" }>;
      laneExecution: Exclude<HarnessWorkerDispatch["laneExecution"], null>;
      executionClaim?: HarnessWorkerExecutionClaimContext;
      failure: {
        kind: "execution_envelope_reconstruction_failed";
        message: string;
      };
    }) => void | Promise<void>;
    onHarnessFollowOnDispatchSuppressed?: (input: {
      tenantId: string;
      runId: string;
      workflowId: string;
      dispatchHandoff: Extract<HarnessWorkerDispatchHandoff, { kind: "follow_on_dispatch" }>;
      laneExecution: Exclude<HarnessWorkerDispatch["laneExecution"], null>;
      executionClaim?: HarnessWorkerExecutionClaimContext;
      failure: {
        kind: "execution_envelope_reconstruction_failed";
        message: string;
      };
    }) => void | Promise<void>;
    onHarnessReactivatedFollowOnDispatchSuppressed?: (input: {
      tenantId: string;
      runId: string;
      workflowId: string;
      dispatchHandoff: HarnessReactivatedFollowOnDispatchHandoff;
      laneExecution: Exclude<HarnessWorkerDispatch["laneExecution"], null>;
      executionClaim?: HarnessWorkerExecutionClaimContext;
      failure: {
        kind: "execution_envelope_reconstruction_failed";
        message: string;
      };
    }) => void | Promise<void>;
  };
  workerInstanceId?: string;
  tenantId: string;
  runId: string;
  workflowId: string;
  dispatchHandoff: HarnessWorkerDispatchHandoff;
  laneExecution: Exclude<HarnessWorkerDispatch["laneExecution"], null>;
  executionClaim?: HarnessWorkerExecutionClaimContext;
  failureMessage: string;
}) {
  const handoff = {
    tenantId: input.tenantId,
    runId: input.runId,
    workflowId: input.workflowId,
    dispatchHandoff: input.dispatchHandoff,
    laneExecution: input.laneExecution,
    ...(input.executionClaim ? { executionClaim: input.executionClaim } : {}),
    failure: {
      kind: "execution_envelope_reconstruction_failed" as const,
      message: input.failureMessage
    }
  };
  process.stdout.write(
    `${JSON.stringify({
      type: "wealth_factory_harness_execution_start_suppressed",
      workerInstanceId: input.workerInstanceId ?? "worker",
      observedAt: new Date().toISOString(),
      ...handoff
    })}\n`
  );
  try {
    await input.options.onHarnessExecutionStartSuppressed?.(handoff);
  } catch (error) {
    await persistExecutionHookFailure({
      repository: input.repository,
      cardId: input.laneExecution.cardId,
      hookFamily: "execution_start_suppressed",
      hookFamilyLabel: "Execution start suppressed handoff",
      deliveryMode: "generic",
      hookKind: "onHarnessExecutionStartSuppressed",
      hookKindLabel: "Execution start suppressed hook",
      dispatchKind: input.dispatchHandoff.kind,
      executionStage: input.dispatchHandoff.executionStage,
      claimKind: input.executionClaim?.kind,
      error
    });
    console.warn("Harness execution-start-suppressed hook failed after durable claim", {
      runId: input.runId,
      workflowId: input.workflowId,
      cardId: input.laneExecution.cardId,
      dispatchKind: input.dispatchHandoff.kind,
      error: error instanceof Error ? { name: error.name, message: error.message } : { message: String(error) }
    });
  }

  const specificType =
    input.dispatchHandoff.kind === "initial_claim"
      ? "wealth_factory_harness_execution_start_suppressed_initial"
      : input.dispatchHandoff.reactivatedRun
        ? "wealth_factory_harness_execution_start_suppressed_reactivated"
        : "wealth_factory_harness_execution_start_suppressed_follow_on";
  process.stdout.write(
    `${JSON.stringify({
      type: specificType,
      workerInstanceId: input.workerInstanceId ?? "worker",
      observedAt: new Date().toISOString(),
      ...handoff
    })}\n`
  );
  try {
    if (input.dispatchHandoff.kind === "initial_claim") {
      await input.options.onHarnessInitialLaneStartSuppressed?.({
        ...handoff,
        dispatchHandoff: input.dispatchHandoff
      });
      return;
    }
    if (input.dispatchHandoff.reactivatedRun === true) {
      const reactivatedDispatchHandoff: HarnessReactivatedFollowOnDispatchHandoff = {
        ...input.dispatchHandoff,
        reactivatedRun: true
      };
      try {
        await input.options.onHarnessReactivatedFollowOnDispatchSuppressed?.({
          ...handoff,
          dispatchHandoff: reactivatedDispatchHandoff
        });
      } catch (error) {
        await persistExecutionHookFailure({
          repository: input.repository,
          cardId: input.laneExecution.cardId,
          hookFamily: "execution_start_suppressed",
          hookFamilyLabel: "Execution start suppressed handoff",
          deliveryMode: "specific",
          hookKind: "reactivated_follow_on_dispatch",
          hookKindLabel: "Reactivated follow-on dispatch",
          dispatchKind: input.dispatchHandoff.kind,
          executionStage: input.dispatchHandoff.executionStage,
          claimKind: input.executionClaim?.kind,
          error
        });
        console.warn("Harness specific execution-start-suppressed hook failed after durable claim", {
          runId: input.runId,
          workflowId: input.workflowId,
          cardId: input.laneExecution.cardId,
          dispatchKind: input.dispatchHandoff.kind,
          error: error instanceof Error ? { name: error.name, message: error.message } : { message: String(error) }
        });
      }
    }
    await input.options.onHarnessFollowOnDispatchSuppressed?.({
      ...handoff,
      dispatchHandoff: input.dispatchHandoff
    });
  } catch (error) {
    await persistExecutionHookFailure({
      repository: input.repository,
      cardId: input.laneExecution.cardId,
      hookFamily: "execution_start_suppressed",
      hookFamilyLabel: "Execution start suppressed handoff",
      deliveryMode: "specific",
      hookKind:
        input.dispatchHandoff.kind === "initial_claim"
          ? "initial_claim"
          : "follow_on_dispatch",
      hookKindLabel:
        input.dispatchHandoff.kind === "initial_claim"
          ? "Initial claim"
          : "Follow-on dispatch",
      dispatchKind: input.dispatchHandoff.kind,
      executionStage: input.dispatchHandoff.executionStage,
      claimKind: input.executionClaim?.kind,
      error
    });
    console.warn("Harness specific execution-start-suppressed hook failed after durable claim", {
      runId: input.runId,
      workflowId: input.workflowId,
      cardId: input.laneExecution.cardId,
      dispatchKind: input.dispatchHandoff.kind,
      error: error instanceof Error ? { name: error.name, message: error.message } : { message: String(error) }
    });
  }
}

function humanizeLabel(value: string): string {
  return value
    .split("_")
    .filter((segment) => segment.length > 0)
    .map((segment) => `${segment.slice(0, 1).toUpperCase()}${segment.slice(1)}`)
    .join(" ");
}

function toExecutionStartEventPayload(input: {
  dispatchHandoff: HarnessWorkerDispatchHandoff;
  executionClaim?: HarnessWorkerExecutionClaimContext;
  failureMessage?: string;
}): import("../harness/types.js").HarnessExecutionStartEventPayload {
  return {
    kind: input.dispatchHandoff.kind,
    kindLabel: input.dispatchHandoff.kindLabel,
    executionStage: input.dispatchHandoff.executionStage,
    executionStageLabel: input.dispatchHandoff.executionStageLabel,
    ...("reactivatedRun" in input.dispatchHandoff ? { reactivatedRun: input.dispatchHandoff.reactivatedRun } : {}),
    ...("triggeredByCardId" in input.dispatchHandoff ? { triggeredByCardId: input.dispatchHandoff.triggeredByCardId } : {}),
    ...("triggeredByPersona" in input.dispatchHandoff ? { triggeredByPersona: input.dispatchHandoff.triggeredByPersona } : {}),
    ...("triggeredByOutcomeState" in input.dispatchHandoff
      ? { triggeredByOutcomeState: input.dispatchHandoff.triggeredByOutcomeState }
      : {}),
    ...("triggeredByResultSummary" in input.dispatchHandoff && input.dispatchHandoff.triggeredByResultSummary
      ? { triggeredByResultSummary: input.dispatchHandoff.triggeredByResultSummary }
      : {}),
    ...(input.executionClaim ? { claimKind: input.executionClaim.kind } : {}),
    ...(input.failureMessage
      ? {
          failureKind: "execution_envelope_reconstruction_failed" as const,
          failureMessage: input.failureMessage
        }
      : {})
  };
}

async function persistExecutionHookFailure(input: {
  repository: Pick<ReturnType<typeof createPostgresHarnessRepository>, "insertEvent">;
  cardId: string;
  hookFamily:
    | "lane_outcome_ignored"
    | "lane_outcome_committed"
    | "attention_resolved"
    | "post_outcome_action"
    | "execution_start_ready"
    | "execution_start_suppressed"
    | "execution_claimed"
    | "execution_dispatched";
  hookFamilyLabel: string;
  deliveryMode: "generic" | "specific";
  hookKind?: string | undefined;
  hookKindLabel?: string | undefined;
  dispatchKind?: string | undefined;
  executionStage?: string | undefined;
  claimKind?: string | undefined;
  outcomeState?: string | undefined;
  actionKind?: string | undefined;
  attentionDelivery?: "requested" | "reasserted" | undefined;
  reason?: string | undefined;
  currentLaneState?: string | undefined;
  error: unknown;
}) {
  const failureMessage = input.error instanceof Error ? input.error.message : String(input.error);
  await input.repository.insertEvent(
    createHarnessCardEventRecord({
      cardId: input.cardId,
      eventKind: "execution_hook_failed",
      payload: {
        hookFamily: input.hookFamily,
        hookFamilyLabel: input.hookFamilyLabel,
        deliveryMode: input.deliveryMode,
        deliveryModeLabel: input.deliveryMode === "specific" ? "Specific private hook" : "Generic private hook",
        ...(input.hookKind ? { hookKind: input.hookKind } : {}),
        ...(input.hookKindLabel ? { hookKindLabel: input.hookKindLabel } : {}),
        ...(input.dispatchKind ? { dispatchKind: input.dispatchKind } : {}),
        ...(input.executionStage ? { executionStage: input.executionStage } : {}),
        ...(input.claimKind ? { claimKind: input.claimKind } : {}),
        ...(input.outcomeState ? { outcomeState: input.outcomeState } : {}),
        ...(input.actionKind ? { actionKind: input.actionKind } : {}),
        ...(input.attentionDelivery ? { attentionDelivery: input.attentionDelivery } : {}),
        ...(input.reason ? { reason: input.reason } : {}),
        ...(input.currentLaneState ? { currentLaneState: input.currentLaneState } : {}),
        failureMessage
      }
    })
  );
}

function readResolvedAttentionAction(
  transition: HarnessWorkerLaneAttentionTransition | undefined
): Exclude<HarnessPostOutcomeAction, { kind: "dispatch_next_lane" }> | null {
  return transition?.kind === "resolved" ? transition.resolvedAction : null;
}

async function runSpecificIgnoredOutcomeHandler(input: {
  options: {
    workerInstanceId?: string;
    onHarnessLaneOutcomeIgnoredStaleClaim?: (input: {
      tenantId: string;
      runId: string;
      workflowId: string;
      cardId: string;
      ignored: NonNullable<Extract<HarnessWorkerLaneOutcome["ignored"], { reason: "stale_execution_claim" }>>;
    }) => void | Promise<void>;
    onHarnessLaneOutcomeIgnoredLaneNotWorking?: (input: {
      tenantId: string;
      runId: string;
      workflowId: string;
      cardId: string;
      ignored: NonNullable<Extract<HarnessWorkerLaneOutcome["ignored"], { reason: "lane_not_working" }>>;
    }) => void | Promise<void>;
    onHarnessLaneOutcomeIgnoredTerminalRun?: (input: {
      tenantId: string;
      runId: string;
      workflowId: string;
      cardId: string;
      ignored: NonNullable<Extract<HarnessWorkerLaneOutcome["ignored"], { reason: "terminal_run" }>>;
    }) => void | Promise<void>;
  };
  handoff: {
    tenantId: string;
    runId: string;
    workflowId: string;
    cardId: string;
    ignored: NonNullable<HarnessWorkerLaneOutcome["ignored"]>;
  };
}) {
  switch (input.handoff.ignored.reason) {
    case "stale_execution_claim": {
      emitSpecificIgnoredOutcomeEvent(
        "wealth_factory_harness_lane_outcome_ignored_stale_claim",
        input.options.workerInstanceId,
        input.handoff
      );
      await input.options.onHarnessLaneOutcomeIgnoredStaleClaim?.(input.handoff as {
        tenantId: string;
        runId: string;
        workflowId: string;
        cardId: string;
        ignored: NonNullable<Extract<HarnessWorkerLaneOutcome["ignored"], { reason: "stale_execution_claim" }>>;
      });
      return;
    }
    case "lane_not_working": {
      emitSpecificIgnoredOutcomeEvent(
        "wealth_factory_harness_lane_outcome_ignored_lane_not_working",
        input.options.workerInstanceId,
        input.handoff
      );
      await input.options.onHarnessLaneOutcomeIgnoredLaneNotWorking?.(input.handoff as {
        tenantId: string;
        runId: string;
        workflowId: string;
        cardId: string;
        ignored: NonNullable<Extract<HarnessWorkerLaneOutcome["ignored"], { reason: "lane_not_working" }>>;
      });
      return;
    }
    case "terminal_run": {
      emitSpecificIgnoredOutcomeEvent(
        "wealth_factory_harness_lane_outcome_ignored_terminal_run",
        input.options.workerInstanceId,
        input.handoff
      );
      await input.options.onHarnessLaneOutcomeIgnoredTerminalRun?.(input.handoff as {
        tenantId: string;
        runId: string;
        workflowId: string;
        cardId: string;
        ignored: NonNullable<Extract<HarnessWorkerLaneOutcome["ignored"], { reason: "terminal_run" }>>;
      });
    }
  }
}

async function runSpecificExecutionClaimHandler(input: {
  options: {
    workerInstanceId?: string;
    onHarnessApprovedExecutionClaim?: (input: {
      tenantId: string;
      runId: string;
      workflowId: string;
      executionClaim: Extract<HarnessWorkerExecutionClaimContext, { kind: "approved_claim" }>;
      laneExecution: HarnessWorkerExecutionEnvelope["laneExecution"];
    }) => void | Promise<void>;
    onHarnessRecoveredExecutionClaim?: (input: {
      tenantId: string;
      runId: string;
      workflowId: string;
      executionClaim: Extract<HarnessWorkerExecutionClaimContext, { kind: "working_claim_refresh" }>;
      laneExecution: HarnessWorkerExecutionEnvelope["laneExecution"];
    }) => void | Promise<void>;
    onHarnessExistingWorkingExecutionClaim?: (input: {
      tenantId: string;
      runId: string;
      workflowId: string;
      executionClaim: Extract<HarnessWorkerExecutionClaimContext, { kind: "existing_working_claim" }>;
      laneExecution: HarnessWorkerExecutionEnvelope["laneExecution"];
    }) => void | Promise<void>;
  };
  handoff: {
    tenantId: string;
    runId: string;
    workflowId: string;
    executionClaim: HarnessWorkerExecutionClaimContext;
    laneExecution: HarnessWorkerExecutionEnvelope["laneExecution"];
  };
}) {
  switch (input.handoff.executionClaim.kind) {
    case "approved_claim":
      emitSpecificExecutionClaimEvent(
        "wealth_factory_harness_execution_claim_approved",
        input.options.workerInstanceId,
        input.handoff
      );
      await input.options.onHarnessApprovedExecutionClaim?.(input.handoff as {
        tenantId: string;
        runId: string;
        workflowId: string;
        executionClaim: Extract<HarnessWorkerExecutionClaimContext, { kind: "approved_claim" }>;
        laneExecution: HarnessWorkerExecutionEnvelope["laneExecution"];
      });
      return;
    case "working_claim_refresh":
      emitSpecificExecutionClaimEvent(
        "wealth_factory_harness_execution_claim_recovered",
        input.options.workerInstanceId,
        input.handoff
      );
      await input.options.onHarnessRecoveredExecutionClaim?.(input.handoff as {
        tenantId: string;
        runId: string;
        workflowId: string;
        executionClaim: Extract<HarnessWorkerExecutionClaimContext, { kind: "working_claim_refresh" }>;
        laneExecution: HarnessWorkerExecutionEnvelope["laneExecution"];
      });
      return;
    case "existing_working_claim":
      emitSpecificExecutionClaimEvent(
        "wealth_factory_harness_execution_claim_existing_working",
        input.options.workerInstanceId,
        input.handoff
      );
      await input.options.onHarnessExistingWorkingExecutionClaim?.(input.handoff as {
        tenantId: string;
        runId: string;
        workflowId: string;
        executionClaim: Extract<HarnessWorkerExecutionClaimContext, { kind: "existing_working_claim" }>;
        laneExecution: HarnessWorkerExecutionEnvelope["laneExecution"];
      });
      return;
  }
}

async function runSpecificExecutionDispatchHandler(input: {
  repository: Pick<ReturnType<typeof createPostgresHarnessRepository>, "insertEvent">;
  options: {
    workerInstanceId?: string;
    onHarnessInitialLaneStart?: (input: {
      tenantId: string;
      runId: string;
      workflowId: string;
      dispatchHandoff: Extract<HarnessWorkerDispatchHandoff, { kind: "initial_claim" }>;
      laneExecution: HarnessWorkerExecutionEnvelope["laneExecution"];
    }) => void | Promise<void>;
    onHarnessFollowOnDispatch?: (input: {
      tenantId: string;
      runId: string;
      workflowId: string;
      dispatchHandoff: Extract<HarnessWorkerDispatchHandoff, { kind: "follow_on_dispatch" }>;
      laneExecution: HarnessWorkerExecutionEnvelope["laneExecution"];
    }) => void | Promise<void>;
    onHarnessReactivatedFollowOnDispatch?: (input: {
      tenantId: string;
      runId: string;
      workflowId: string;
      dispatchHandoff: HarnessReactivatedFollowOnDispatchHandoff;
      laneExecution: HarnessWorkerExecutionEnvelope["laneExecution"];
    }) => void | Promise<void>;
  };
  handoff: {
    tenantId: string;
    runId: string;
    workflowId: string;
    dispatchHandoff: HarnessWorkerDispatchHandoff;
    laneExecution: HarnessWorkerExecutionEnvelope["laneExecution"];
  };
}) {
  if (input.handoff.dispatchHandoff.kind === "initial_claim") {
    emitSpecificExecutionDispatchEvent(
      "wealth_factory_harness_execution_dispatch_initial",
      input.options.workerInstanceId,
      input.handoff
    );
    await input.options.onHarnessInitialLaneStart?.(input.handoff as {
      tenantId: string;
      runId: string;
      workflowId: string;
      dispatchHandoff: Extract<HarnessWorkerDispatchHandoff, { kind: "initial_claim" }>;
      laneExecution: HarnessWorkerExecutionEnvelope["laneExecution"];
    });
    return;
  }
  if (input.handoff.dispatchHandoff.reactivatedRun) {
    emitSpecificExecutionDispatchEvent(
      "wealth_factory_harness_execution_dispatch_reactivated",
      input.options.workerInstanceId,
      input.handoff
    );
    try {
      await input.options.onHarnessReactivatedFollowOnDispatch?.(input.handoff as {
        tenantId: string;
        runId: string;
        workflowId: string;
        dispatchHandoff: HarnessReactivatedFollowOnDispatchHandoff;
        laneExecution: HarnessWorkerExecutionEnvelope["laneExecution"];
      });
    } catch (error) {
      await persistExecutionHookFailure({
        repository: input.repository,
        cardId: input.handoff.laneExecution.cardId,
        hookFamily: "execution_dispatched",
        hookFamilyLabel: "Execution dispatch handoff",
        deliveryMode: "specific",
        hookKind: "reactivated_follow_on_dispatch",
        hookKindLabel: "Reactivated follow-on dispatch",
        dispatchKind: input.handoff.dispatchHandoff.kind,
        executionStage: input.handoff.dispatchHandoff.executionStage,
        error
      });
      console.warn("Harness specific execution-dispatch handler failed after durable lane claim", {
        runId: input.handoff.runId,
        workflowId: input.handoff.workflowId,
        cardId: input.handoff.laneExecution.cardId,
        dispatchKind: input.handoff.dispatchHandoff.kind,
        error: error instanceof Error ? { name: error.name, message: error.message } : { message: String(error) }
      });
    }
  }
  emitSpecificExecutionDispatchEvent(
    "wealth_factory_harness_execution_dispatch_follow_on",
    input.options.workerInstanceId,
    input.handoff
  );
  await input.options.onHarnessFollowOnDispatch?.(input.handoff as {
    tenantId: string;
    runId: string;
    workflowId: string;
    dispatchHandoff: Extract<HarnessWorkerDispatchHandoff, { kind: "follow_on_dispatch" }>;
    laneExecution: HarnessWorkerExecutionEnvelope["laneExecution"];
  });
}

function emitSpecificIgnoredOutcomeEvent(
  type:
    | "wealth_factory_harness_lane_outcome_ignored_stale_claim"
    | "wealth_factory_harness_lane_outcome_ignored_lane_not_working"
    | "wealth_factory_harness_lane_outcome_ignored_terminal_run",
  workerInstanceId: string | undefined,
  payload: {
    tenantId: string;
    runId: string;
    workflowId: string;
    cardId: string;
    ignored: NonNullable<HarnessWorkerLaneOutcome["ignored"]>;
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

function emitSpecificExecutionClaimEvent(
  type:
    | "wealth_factory_harness_execution_claim_approved"
    | "wealth_factory_harness_execution_claim_recovered"
    | "wealth_factory_harness_execution_claim_existing_working",
  workerInstanceId: string | undefined,
  payload: {
    tenantId: string;
    runId: string;
    workflowId: string;
    executionClaim: HarnessWorkerExecutionClaimContext;
    laneExecution: HarnessWorkerExecutionEnvelope["laneExecution"];
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

function emitSpecificExecutionDispatchEvent(
  type:
    | "wealth_factory_harness_execution_dispatch_initial"
    | "wealth_factory_harness_execution_dispatch_follow_on"
    | "wealth_factory_harness_execution_dispatch_reactivated",
  workerInstanceId: string | undefined,
  payload: {
    tenantId: string;
    runId: string;
    workflowId: string;
    dispatchHandoff: HarnessWorkerDispatchHandoff;
    laneExecution: HarnessWorkerExecutionEnvelope["laneExecution"];
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
  executionEngine: "wf_harness_v1" | "wf_native_v1";
  workflowRegistry: Pick<ReturnType<typeof createHarnessWorkflowRegistry>, "getDefinition">;
  recordStatus?: (status: { tenantId: string; runId: string; workflowId: string; status: "queued" | "running" | "failed" }) => void | Promise<void>;
  nativeExecutor?: NativeExecutor;
  loadBoundProviderContext?: (input: {
    tenantId: string;
    runId: string;
    workflowId: string;
    requiredCapabilities: readonly ProviderCapability[];
  }) => Promise<readonly RuntimeProviderBinding[] | null>;
  hydrateProviderContext?: (input: {
    tenantId: string;
    runId: string;
    workflowId: string;
    providerBindings: readonly RuntimeProviderBinding[];
  }) => Promise<readonly RuntimeProviderExecutionBinding[]>;
  commitNativeOutcome?: (input: {
    tenantId: string;
    runId: string;
    workflowId: string;
    cardId: string;
    executionClaimToken?: string;
    outcome: NativeExecutionOutcome;
  }) => Promise<HarnessWorkerLaneOutcome>;
  workerInstanceId?: string;
  onHarnessExecutionStartSuppressed?: (input: {
    tenantId: string;
    runId: string;
    workflowId: string;
    dispatchHandoff: HarnessWorkerDispatchHandoff;
    laneExecution: Exclude<HarnessWorkerDispatch["laneExecution"], null>;
    executionClaim?: HarnessWorkerExecutionClaimContext;
    failure: {
      kind: "execution_envelope_reconstruction_failed";
      message: string;
    };
  }) => void | Promise<void>;
  onHarnessInitialLaneStartSuppressed?: (input: {
    tenantId: string;
    runId: string;
    workflowId: string;
    dispatchHandoff: Extract<HarnessWorkerDispatchHandoff, { kind: "initial_claim" }>;
    laneExecution: Exclude<HarnessWorkerDispatch["laneExecution"], null>;
    executionClaim?: HarnessWorkerExecutionClaimContext;
    failure: {
      kind: "execution_envelope_reconstruction_failed";
      message: string;
    };
  }) => void | Promise<void>;
  onHarnessFollowOnDispatchSuppressed?: (input: {
    tenantId: string;
    runId: string;
    workflowId: string;
    dispatchHandoff: Extract<HarnessWorkerDispatchHandoff, { kind: "follow_on_dispatch" }>;
    laneExecution: Exclude<HarnessWorkerDispatch["laneExecution"], null>;
    executionClaim?: HarnessWorkerExecutionClaimContext;
    failure: {
      kind: "execution_envelope_reconstruction_failed";
      message: string;
    };
  }) => void | Promise<void>;
  onDispatch?: (dispatch: HarnessWorkerDispatch) => void;
  onExecutionEnvelope?: (envelope: HarnessWorkerExecutionEnvelope) => void | Promise<void>;
  onDispatchResolution?: (input: {
    dispatch: HarnessWorkerDispatch;
    executionClaim?: HarnessWorkerExecutionClaimContext;
    executionEnvelope: HarnessWorkerExecutionEnvelope;
  }) => void | Promise<void>;
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
    let finalStatus: PaperclipRunStatus = dispatch.status;
    let nativeOutcomeCommitted = false;
    if (dispatch.laneExecution) {
      let executionEnvelope: HarnessWorkerExecutionEnvelope | null = null;
      try {
        executionEnvelope = await buildHarnessWorkerExecutionEnvelope({
          repository: options.repository,
          tenantId: options.payload.tenantId,
          dispatch,
          requiredCapabilities: options.workflowRegistry.getDefinition(dispatch.workflowId).requiredCapabilities,
          ...(dispatchResolution.lane ? { laneContext: dispatchResolution.lane } : {}),
          ...(dispatchResolution.executionClaim ? { executionClaimContext: dispatchResolution.executionClaim } : {})
        });
      } catch (error) {
        const failureMessage = error instanceof Error ? error.message : String(error);
        await options.repository.insertEvent(
          createHarnessCardEventRecord({
            cardId: dispatch.laneExecution.cardId,
            eventKind: "execution_start_suppressed",
            payload: toExecutionStartEventPayload({
              dispatchHandoff: dispatch.dispatchHandoff ?? {
                kind: "initial_claim",
                kindLabel: "Initial lane claim",
                executionStage: "initial_lane_start",
                executionStageLabel: "Initial lane start"
              },
              ...(dispatchResolution.executionClaim ? { executionClaim: dispatchResolution.executionClaim } : {}),
              failureMessage
            })
          })
        );
        console.warn("Harness execution envelope reconstruction failed after durable lane claim", {
          runId: dispatch.runId,
          workflowId: dispatch.workflowId,
          cardId: dispatch.laneExecution.cardId,
          error: error instanceof Error ? { name: error.name, message: error.message } : { message: String(error) }
        });
        await emitHarnessExecutionStartSuppressed({
          repository: options.repository,
          options,
          ...(options.workerInstanceId ? { workerInstanceId: options.workerInstanceId } : {}),
          tenantId: options.payload.tenantId,
          runId: dispatch.runId,
          workflowId: dispatch.workflowId,
          dispatchHandoff: dispatch.dispatchHandoff ?? {
            kind: "initial_claim",
            kindLabel: "Initial lane claim",
            executionStage: "initial_lane_start",
            executionStageLabel: "Initial lane start"
          },
          laneExecution: dispatch.laneExecution,
          ...(dispatchResolution.executionClaim ? { executionClaim: dispatchResolution.executionClaim } : {}),
          failureMessage
        });
      }
      if (executionEnvelope) {
        await options.repository.insertEvent(
          createHarnessCardEventRecord({
            cardId: executionEnvelope.laneExecution.cardId,
            eventKind: "execution_start_ready",
            payload: toExecutionStartEventPayload({
              dispatchHandoff: executionEnvelope.dispatchHandoff ?? {
                kind: "initial_claim",
                kindLabel: "Initial lane claim",
                executionStage: "initial_lane_start",
                executionStageLabel: "Initial lane start"
              },
              executionClaim: {
                kind: executionEnvelope.executionClaim.kind,
                claimedAt: executionEnvelope.executionClaim.claimedAt,
                previousClaimedAt: executionEnvelope.executionClaim.previousClaimedAt
              }
            })
          })
        );
        try {
          await options.onExecutionEnvelope?.(executionEnvelope);
        } catch (error) {
          await persistExecutionHookFailure({
            repository: options.repository,
            cardId: executionEnvelope.laneExecution.cardId,
            hookFamily: "execution_start_ready",
            hookFamilyLabel: "Execution start ready handoff",
            deliveryMode: "generic",
            hookKind: "onExecutionEnvelope",
            hookKindLabel: "Lane-ready hook",
            dispatchKind: dispatch.dispatchHandoff?.kind,
            executionStage: dispatch.dispatchHandoff?.executionStage,
            claimKind: dispatchResolution.executionClaim?.kind,
            error
          });
          console.warn("Harness lane-ready hook failed after durable lane claim", {
            runId: executionEnvelope.runId,
            workflowId: executionEnvelope.workflowId,
            cardId: executionEnvelope.laneExecution.cardId,
            error: error instanceof Error ? { name: error.name, message: error.message } : { message: String(error) }
          });
        }
        try {
          await options.onDispatchResolution?.({
            dispatch,
            ...(dispatchResolution.executionClaim ? { executionClaim: dispatchResolution.executionClaim } : {}),
            executionEnvelope
          });
        } catch (error) {
          await persistExecutionHookFailure({
            repository: options.repository,
            cardId: executionEnvelope.laneExecution.cardId,
            hookFamily: "execution_start_ready",
            hookFamilyLabel: "Execution start ready handoff",
            deliveryMode: "specific",
            hookKind:
              dispatch.dispatchHandoff?.kind === "initial_claim"
                ? "initial_claim"
                : dispatch.dispatchHandoff?.reactivatedRun === true
                  ? "reactivated_follow_on_dispatch"
                  : "follow_on_dispatch",
            hookKindLabel:
              dispatch.dispatchHandoff?.kind === "initial_claim"
                ? "Initial claim"
                : dispatch.dispatchHandoff?.reactivatedRun === true
                  ? "Reactivated follow-on dispatch"
                  : "Follow-on dispatch",
            dispatchKind: dispatch.dispatchHandoff?.kind,
            executionStage: dispatch.dispatchHandoff?.executionStage,
            claimKind: dispatchResolution.executionClaim?.kind,
            error
          });
          console.warn("Harness execution-start hook failed after durable lane claim", {
            runId: executionEnvelope.runId,
            workflowId: executionEnvelope.workflowId,
            cardId: executionEnvelope.laneExecution.cardId,
            error: error instanceof Error ? { name: error.name, message: error.message } : { message: String(error) }
          });
        }
        if (options.executionEngine === "wf_native_v1") {
          if (!options.nativeExecutor || !options.commitNativeOutcome || !options.loadBoundProviderContext || !options.hydrateProviderContext) {
            throw new Error(`Native executor is not configured for workflow ${dispatch.workflowId}`);
          }
          const committedNativeOutcome = await executeNativeHarnessLane({
            payload: options.payload,
            dispatch,
            executionEnvelope,
            nativeExecutor: options.nativeExecutor,
            loadBoundProviderContext: options.loadBoundProviderContext,
            hydrateProviderContext: options.hydrateProviderContext,
            commitNativeOutcome: options.commitNativeOutcome
          });
          nativeOutcomeCommitted = true;
          finalStatus = deriveHarnessWorkflowStatusFromOutcome(committedNativeOutcome) ?? dispatch.status;
        }
      }
      options.onDispatch?.(dispatch);
      if (!nativeOutcomeCommitted) {
        await options.recordStatus?.({
          tenantId: options.payload.tenantId,
          runId: dispatch.runId,
          workflowId: dispatch.workflowId,
          status: dispatch.status
        });
      }
    }
    if (!dispatch.laneExecution) {
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
      status: finalStatus
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

async function emitHarnessExecutionStartHandoffs(input: {
  repository: Pick<ReturnType<typeof createPostgresHarnessRepository>, "insertEvent">;
  options: {
    workerInstanceId?: string;
    onHarnessExecutionClaimed?: (input: {
      tenantId: string;
      runId: string;
      workflowId: string;
      executionClaim: HarnessWorkerExecutionClaimContext;
      laneExecution: HarnessWorkerExecutionEnvelope["laneExecution"];
    }) => void | Promise<void>;
    onHarnessApprovedExecutionClaim?: (input: {
      tenantId: string;
      runId: string;
      workflowId: string;
      executionClaim: Extract<HarnessWorkerExecutionClaimContext, { kind: "approved_claim" }>;
      laneExecution: HarnessWorkerExecutionEnvelope["laneExecution"];
    }) => void | Promise<void>;
    onHarnessRecoveredExecutionClaim?: (input: {
      tenantId: string;
      runId: string;
      workflowId: string;
      executionClaim: Extract<HarnessWorkerExecutionClaimContext, { kind: "working_claim_refresh" }>;
      laneExecution: HarnessWorkerExecutionEnvelope["laneExecution"];
    }) => void | Promise<void>;
    onHarnessExistingWorkingExecutionClaim?: (input: {
      tenantId: string;
      runId: string;
      workflowId: string;
      executionClaim: Extract<HarnessWorkerExecutionClaimContext, { kind: "existing_working_claim" }>;
      laneExecution: HarnessWorkerExecutionEnvelope["laneExecution"];
    }) => void | Promise<void>;
    onHarnessExecutionDispatched?: (input: {
      tenantId: string;
      runId: string;
      workflowId: string;
      dispatchHandoff: HarnessWorkerDispatchHandoff;
      laneExecution: HarnessWorkerExecutionEnvelope["laneExecution"];
    }) => void | Promise<void>;
    onHarnessInitialLaneStart?: (input: {
      tenantId: string;
      runId: string;
      workflowId: string;
      dispatchHandoff: Extract<HarnessWorkerDispatchHandoff, { kind: "initial_claim" }>;
      laneExecution: HarnessWorkerExecutionEnvelope["laneExecution"];
    }) => void | Promise<void>;
    onHarnessFollowOnDispatch?: (input: {
      tenantId: string;
      runId: string;
      workflowId: string;
      dispatchHandoff: Extract<HarnessWorkerDispatchHandoff, { kind: "follow_on_dispatch" }>;
      laneExecution: HarnessWorkerExecutionEnvelope["laneExecution"];
    }) => void | Promise<void>;
    onHarnessReactivatedFollowOnDispatch?: (input: {
      tenantId: string;
      runId: string;
      workflowId: string;
      dispatchHandoff: HarnessReactivatedFollowOnDispatchHandoff;
      laneExecution: HarnessWorkerExecutionEnvelope["laneExecution"];
    }) => void | Promise<void>;
  };
  workerInstanceId?: string;
  tenantId: string;
  workflowId: string;
  dispatch: HarnessWorkerDispatch;
  executionClaim?: HarnessWorkerExecutionClaimContext;
  executionEnvelope: HarnessWorkerExecutionEnvelope;
}) {
  const executionClaim =
    input.executionClaim ?? {
      kind: input.executionEnvelope.executionClaim.kind,
      claimedAt: input.executionEnvelope.executionClaim.claimedAt,
      previousClaimedAt: input.executionEnvelope.executionClaim.previousClaimedAt
    };
  const claimHandoff = {
    tenantId: input.tenantId,
    runId: input.dispatch.runId,
    workflowId: input.workflowId,
    executionClaim,
    laneExecution: input.executionEnvelope.laneExecution
  };
  process.stdout.write(
    `${JSON.stringify({
      type: "wealth_factory_harness_execution_claimed",
      workerInstanceId: input.workerInstanceId ?? "worker",
      observedAt: new Date().toISOString(),
      ...claimHandoff
    })}\n`
  );
  try {
    await input.options.onHarnessExecutionClaimed?.(claimHandoff);
  } catch (error) {
    await persistExecutionHookFailure({
      repository: input.repository,
      cardId: input.executionEnvelope.laneExecution.cardId,
      hookFamily: "execution_claimed",
      hookFamilyLabel: "Execution claim handoff",
      deliveryMode: "generic",
      hookKind: "onHarnessExecutionClaimed",
      hookKindLabel: "Execution claim hook",
      claimKind: executionClaim.kind,
      error
    });
    console.warn("Harness execution-claim hook failed after durable lane claim", {
      runId: input.dispatch.runId,
      workflowId: input.workflowId,
      cardId: input.executionEnvelope.laneExecution.cardId,
      claimKind: executionClaim.kind,
      error: error instanceof Error ? { name: error.name, message: error.message } : { message: String(error) }
    });
  }
  try {
    await runSpecificExecutionClaimHandler({
      options: input.options,
      handoff: claimHandoff
    });
  } catch (error) {
    await persistExecutionHookFailure({
      repository: input.repository,
      cardId: input.executionEnvelope.laneExecution.cardId,
      hookFamily: "execution_claimed",
      hookFamilyLabel: "Execution claim handoff",
      deliveryMode: "specific",
      hookKind: executionClaim.kind,
      hookKindLabel: humanizeLabel(executionClaim.kind),
      claimKind: executionClaim.kind,
      error
    });
    console.warn("Harness specific execution-claim handler failed after durable lane claim", {
      runId: input.dispatch.runId,
      workflowId: input.workflowId,
      cardId: input.executionEnvelope.laneExecution.cardId,
      claimKind: executionClaim.kind,
      error: error instanceof Error ? { name: error.name, message: error.message } : { message: String(error) }
    });
  }

  if (!input.dispatch.dispatchHandoff) {
    return;
  }

  const dispatchHandoff = {
    tenantId: input.tenantId,
    runId: input.dispatch.runId,
    workflowId: input.workflowId,
    dispatchHandoff: input.dispatch.dispatchHandoff,
    laneExecution: input.executionEnvelope.laneExecution
  };
  process.stdout.write(
    `${JSON.stringify({
      type: "wealth_factory_harness_execution_dispatched",
      workerInstanceId: input.workerInstanceId ?? "worker",
      observedAt: new Date().toISOString(),
      ...dispatchHandoff
    })}\n`
  );
  try {
    await input.options.onHarnessExecutionDispatched?.(dispatchHandoff);
  } catch (error) {
    await persistExecutionHookFailure({
      repository: input.repository,
      cardId: input.executionEnvelope.laneExecution.cardId,
      hookFamily: "execution_dispatched",
      hookFamilyLabel: "Execution dispatch handoff",
      deliveryMode: "generic",
      hookKind: "onHarnessExecutionDispatched",
      hookKindLabel: "Execution dispatch hook",
      dispatchKind: input.dispatch.dispatchHandoff.kind,
      executionStage: input.dispatch.dispatchHandoff.executionStage,
      error
    });
    console.warn("Harness execution-dispatch hook failed after durable lane claim", {
      runId: input.dispatch.runId,
      workflowId: input.workflowId,
      cardId: input.executionEnvelope.laneExecution.cardId,
      dispatchKind: input.dispatch.dispatchHandoff.kind,
      error: error instanceof Error ? { name: error.name, message: error.message } : { message: String(error) }
    });
  }
  try {
    await runSpecificExecutionDispatchHandler({
      repository: input.repository,
      options: input.options,
      handoff: dispatchHandoff
    });
  } catch (error) {
    await persistExecutionHookFailure({
      repository: input.repository,
      cardId: input.executionEnvelope.laneExecution.cardId,
      hookFamily: "execution_dispatched",
      hookFamilyLabel: "Execution dispatch handoff",
      deliveryMode: "specific",
      hookKind:
        input.dispatch.dispatchHandoff.kind === "initial_claim"
          ? "initial_claim"
          : "follow_on_dispatch",
      hookKindLabel:
        input.dispatch.dispatchHandoff.kind === "initial_claim"
          ? "Initial claim"
          : "Follow-on dispatch",
      dispatchKind: input.dispatch.dispatchHandoff.kind,
      executionStage: input.dispatch.dispatchHandoff.executionStage,
      error
    });
    console.warn("Harness specific execution-dispatch handler failed after durable lane claim", {
      runId: input.dispatch.runId,
      workflowId: input.workflowId,
      cardId: input.executionEnvelope.laneExecution.cardId,
      dispatchKind: input.dispatch.dispatchHandoff.kind,
      error: error instanceof Error ? { name: error.name, message: error.message } : { message: String(error) }
    });
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

