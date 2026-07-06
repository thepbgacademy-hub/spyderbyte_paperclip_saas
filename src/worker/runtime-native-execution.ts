import type { HarnessWorkerDispatch, HarnessWorkerExecutionEnvelope, HarnessWorkerLaneOutcome } from "../harness/worker-executor.js";
import type { HarnessTaxStrategyPrerequisiteSnapshotRecord } from "../harness/types.js";
import type { ProviderCapability } from "../packages/package-types.js";
import { RuntimeProviderExecutionError, type RuntimeProviderExecutionBinding } from "../providers/runtime-provider-execution.js";
import type { RuntimeProviderBinding } from "../providers/runtime-provider-resolution.js";
import { RuntimeProviderResolutionError } from "../providers/runtime-provider-resolution.js";
import { NativeExecutionError, type NativeExecutionOutcome, type NativeExecutor } from "./native-executor.js";

class WorkflowPrerequisiteResolutionError extends Error {
  readonly workflowId: string;

  constructor(input: { workflowId: string; cause: unknown }) {
    super(`Failed to load bounded workflow prerequisites for ${input.workflowId}`);
    this.name = "WorkflowPrerequisiteResolutionError";
    this.workflowId = input.workflowId;
    this.cause = input.cause;
  }
}

export async function executeNativeHarnessLane(input: {
  commitNativeOutcome: (input: {
    tenantId: string;
    runId: string;
    workflowId: string;
    cardId: string;
    executionClaimToken?: string;
    outcome: NativeExecutionOutcome;
  }) => Promise<HarnessWorkerLaneOutcome>;
  dispatch: HarnessWorkerDispatch;
  executionEnvelope: HarnessWorkerExecutionEnvelope;
  hydrateProviderContext: (input: {
    tenantId: string;
    runId: string;
    workflowId: string;
    providerBindings: readonly RuntimeProviderBinding[];
  }) => Promise<readonly RuntimeProviderExecutionBinding[]>;
  loadBoundProviderContext: (input: {
    tenantId: string;
    runId: string;
    workflowId: string;
    requiredCapabilities: readonly ProviderCapability[];
  }) => Promise<readonly RuntimeProviderBinding[] | null>;
  loadTaxStrategyPrerequisiteSnapshot?: (input: {
    runId: string;
  }) => Promise<HarnessTaxStrategyPrerequisiteSnapshotRecord | null>;
  nativeExecutor: NativeExecutor;
  payload: {
    tenantId: string;
    runId: string;
    workflowId: string;
  };
}): Promise<HarnessWorkerLaneOutcome> {
  let nativeOutcome: NativeExecutionOutcome;
  let executionEnvelope = input.executionEnvelope;

  try {
    executionEnvelope = await augmentExecutionEnvelopeWithWorkflowPrerequisites({
      workflowId: input.dispatch.workflowId,
      executionEnvelope: input.executionEnvelope,
      runId: input.dispatch.runId,
      ...(input.loadTaxStrategyPrerequisiteSnapshot
        ? { loadTaxStrategyPrerequisiteSnapshot: input.loadTaxStrategyPrerequisiteSnapshot }
        : {})
    });
    const providerBindings = await input.loadBoundProviderContext({
      tenantId: input.payload.tenantId,
      runId: input.dispatch.runId,
      workflowId: input.dispatch.workflowId,
      requiredCapabilities: executionEnvelope.requiredCapabilities
    });
    if (providerBindings === null) {
      throw new RuntimeProviderResolutionError({
        tenantId: input.payload.tenantId,
        workflowId: input.dispatch.workflowId,
        capability: executionEnvelope.requiredCapabilities[0] ?? "text_generation"
      });
    }

    const hydratedProviderContext = await input.hydrateProviderContext({
      tenantId: input.payload.tenantId,
      runId: input.dispatch.runId,
      workflowId: input.dispatch.workflowId,
      providerBindings
    });
    if (hydratedProviderContext.length !== 1 || !hydratedProviderContext[0]) {
      throw new RuntimeProviderExecutionError({
        tenantId: input.payload.tenantId,
        workflowId: input.dispatch.workflowId,
        providerKind: providerBindings[0]?.providerKind ?? "unknown_provider",
        reason: "multi_provider_binding_unsupported"
      });
    }

    nativeOutcome = await input.nativeExecutor.execute({
      tenantId: input.payload.tenantId,
      runId: input.dispatch.runId,
      workflowId: input.dispatch.workflowId,
      executionEnvelope,
      providerBinding: hydratedProviderContext[0]
    });
  } catch (error) {
    const failureOutcome = toNativeProviderFailureOutcome(error);
    if (!failureOutcome) {
      throw error;
    }
    nativeOutcome = failureOutcome;
  }

  return input.commitNativeOutcome({
    tenantId: input.payload.tenantId,
    runId: input.dispatch.runId,
    workflowId: input.dispatch.workflowId,
    cardId: input.executionEnvelope.laneExecution.cardId,
    executionClaimToken: input.executionEnvelope.executionClaim.token,
    outcome: nativeOutcome
  });
}

async function augmentExecutionEnvelopeWithWorkflowPrerequisites(input: {
  workflowId: string;
  executionEnvelope: HarnessWorkerExecutionEnvelope;
  loadTaxStrategyPrerequisiteSnapshot?: (input: { runId: string }) => Promise<HarnessTaxStrategyPrerequisiteSnapshotRecord | null>;
  runId: string;
}): Promise<HarnessWorkerExecutionEnvelope> {
  if (input.workflowId !== "wf_tax_strategy" || !input.loadTaxStrategyPrerequisiteSnapshot) {
    return input.executionEnvelope;
  }

  let snapshot: HarnessTaxStrategyPrerequisiteSnapshotRecord | null;
  try {
    snapshot = await input.loadTaxStrategyPrerequisiteSnapshot({ runId: input.runId });
  } catch (error) {
    throw new WorkflowPrerequisiteResolutionError({
      workflowId: input.workflowId,
      cause: error
    });
  }
  if (!snapshot || snapshot.evidence.length === 0) {
    return input.executionEnvelope;
  }

  return {
    ...input.executionEnvelope,
    workflowPrerequisites: {
      ...input.executionEnvelope.workflowPrerequisites,
      taxStrategyEvidence: snapshot.evidence
    }
  };
}

function toNativeProviderFailureOutcome(error: unknown): NativeExecutionOutcome | null {
  if (error instanceof WorkflowPrerequisiteResolutionError) {
    return {
      state: "blocked",
      resumeSummary:
        `Native execution could not continue because ${error.workflowId} prerequisite evidence could not be loaded safely at execution time. ` +
        "Keep this lane blocked until the prerequisite snapshot read is healthy again."
    };
  }

  if (error instanceof RuntimeProviderResolutionError) {
    return {
      state: "blocked",
      resumeSummary: "Native execution could not continue because the run lost its required tenant-bound provider binding before execution started."
    };
  }

  if (error instanceof RuntimeProviderExecutionError) {
    return {
      state: "blocked",
      resumeSummary:
        error.reason === "secret_unavailable"
          ? "Native execution could not continue because the bound provider secret was unavailable at execution time."
          : error.reason === "secret_payload_invalid"
            ? "Native execution could not continue because the bound provider secret payload was invalid for execution."
            : "Native execution could not continue because the run no longer has exactly one launch-ready provider binding."
    };
  }

  if (error instanceof NativeExecutionError) {
    return {
      state: "blocked",
      resumeSummary:
        error.reason === "provider_kind_unsupported"
          ? "Native execution could not continue because the bound provider kind is not supported by the current native executor."
          : error.reason === "codex_subscription_auth_missing"
            ? "Native execution could not continue because the Codex subscription binding is missing its isolated auth metadata. Keep this lane blocked until the subscription-backed provider binding is repaired."
            : error.reason === "codex_subscription_failed"
              ? isCodexSubscriptionSessionRevoked(error.message)
                ? "Native execution could not continue because the Codex subscription session ended and must be signed in again. Keep this lane blocked until the isolated Codex device login is refreshed for this provider lane."
                : "Native execution reached the Codex subscription lane but the isolated subscription runner failed before a usable response was returned."
          : error.reason === "secret_missing"
            ? "Native execution could not continue because the bound provider secret is missing the required API key at execution time."
          : error.reason === "request_failed"
              ? Number.isInteger(error.statusCode)
                ? `Native execution reached the provider lane but the provider rejected the request with HTTP ${error.statusCode}.`
                : "Native execution reached the provider lane but the provider request failed before a usable response was returned."
              : error.reason === "response_invalid"
                ? "Native execution reached the provider lane but the provider response was invalid for bounded native execution."
                : "Native execution reached the provider lane but could not complete the provider call safely. Review the provider response and continue with workflow-specific native handling."
    };
  }

  return null;
}

function isCodexSubscriptionSessionRevoked(message: string): boolean {
  return /refresh_token_invalidated|token_invalidated|refresh token was revoked|session has ended|sign in again/i.test(message);
}
