import type { HarnessWorkerDispatch, HarnessWorkerExecutionEnvelope, HarnessWorkerLaneOutcome } from "../harness/worker-executor.js";
import type { ProviderCapability } from "../packages/package-types.js";
import { RuntimeProviderExecutionError, type RuntimeProviderExecutionBinding } from "../providers/runtime-provider-execution.js";
import type { RuntimeProviderBinding } from "../providers/runtime-provider-resolution.js";
import { RuntimeProviderResolutionError } from "../providers/runtime-provider-resolution.js";
import { NativeExecutionError, type NativeExecutionOutcome, type NativeExecutor } from "./native-executor.js";

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
  nativeExecutor: NativeExecutor;
  payload: {
    tenantId: string;
    runId: string;
    workflowId: string;
  };
}): Promise<HarnessWorkerLaneOutcome> {
  let nativeOutcome: NativeExecutionOutcome;

  try {
    const providerBindings = await input.loadBoundProviderContext({
      tenantId: input.payload.tenantId,
      runId: input.dispatch.runId,
      workflowId: input.dispatch.workflowId,
      requiredCapabilities: input.executionEnvelope.requiredCapabilities
    });
    if (providerBindings === null) {
      throw new RuntimeProviderResolutionError({
        tenantId: input.payload.tenantId,
        workflowId: input.dispatch.workflowId,
        capability: input.executionEnvelope.requiredCapabilities[0] ?? "text_generation"
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
      executionEnvelope: input.executionEnvelope,
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

function toNativeProviderFailureOutcome(error: unknown): NativeExecutionOutcome | null {
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
      resumeSummary: "Native execution reached the provider lane but could not complete the provider call safely. Review the provider response and continue with workflow-specific native handling."
    };
  }

  return null;
}
