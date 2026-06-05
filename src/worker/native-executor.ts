import type { HarnessWorkerExecutionEnvelope } from "../harness/worker-executor.js";
import type { RuntimeProviderExecutionBinding } from "../providers/runtime-provider-execution.js";
import { createNativeOpenAITextGenerator, NativeOpenAIExecutionError } from "../providers/native-openai-text.js";

export type NativeExecutionOutcome = {
  state: "waiting" | "done" | "blocked" | "cancelled";
  resultSummary?: string;
  resumeSummary?: string;
};

export type NativeExecutionInput = {
  tenantId: string;
  runId: string;
  workflowId: string;
  executionEnvelope: HarnessWorkerExecutionEnvelope;
  providerBinding: RuntimeProviderExecutionBinding;
};

export type NativeExecutor = {
  execute(input: NativeExecutionInput): Promise<NativeExecutionOutcome>;
};

export { NativeOpenAIExecutionError as NativeExecutionError };

export function createDefaultNativeExecutor(options?: {
  openAIModel?: string;
  fetch?: typeof fetch;
}): NativeExecutor {
  const openAITextGenerator = createNativeOpenAITextGenerator({
    ...(options?.openAIModel ? { model: options.openAIModel } : {}),
    ...(options?.fetch ? { fetch: options.fetch } : {})
  });

  return {
    async execute(input) {
      const generated = await openAITextGenerator.generateLaneResult({
        binding: input.providerBinding,
        workflowId: input.workflowId,
        executionEnvelope: input.executionEnvelope
      });

      return {
        state: "blocked",
        resumeSummary:
          `Validated the bound ${input.providerBinding.label} provider lane for ` +
          `${input.executionEnvelope.laneExecution.persona.toUpperCase()}: ${input.executionEnvelope.laneExecution.title}. ` +
          `Workflow-specific native completion is not implemented yet. Provisional provider summary: ${generated.resultSummary}`
      };
    }
  };
}
