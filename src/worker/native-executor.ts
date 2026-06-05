import type { HarnessWorkerExecutionEnvelope } from "../harness/worker-executor.js";

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
};

export type NativeExecutor = {
  execute(input: NativeExecutionInput): Promise<NativeExecutionOutcome>;
};

export function createPhaseOneNativeExecutor(): NativeExecutor {
  return {
    async execute(input) {
      return {
        state: "blocked",
        resumeSummary: `Native executor skeleton claimed the ${input.executionEnvelope.laneExecution.persona} lane for ${input.executionEnvelope.laneExecution.title}, but workflow-specific execution is not implemented yet.`
      };
    }
  };
}
