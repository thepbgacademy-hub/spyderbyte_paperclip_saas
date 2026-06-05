export type ExecutionEngine = "paperclip" | "wf_harness_v1" | "wf_native_v1";

export interface ExecutionSelectorInput {
  workflowId: string;
  harnessEnabledWorkflowIds: readonly string[];
  nativeExecutorEnabledWorkflowIds?: readonly string[];
  harnessEligibleWorkflowIds?: readonly string[];
}

export function selectExecutionEngine(input: ExecutionSelectorInput): ExecutionEngine {
  const eligibleWorkflowIds = new Set(input.harnessEligibleWorkflowIds ?? input.harnessEnabledWorkflowIds);
  if (!eligibleWorkflowIds.has(input.workflowId)) {
    return "paperclip";
  }

  if (input.nativeExecutorEnabledWorkflowIds?.includes(input.workflowId)) {
    return "wf_native_v1";
  }

  return input.harnessEnabledWorkflowIds.includes(input.workflowId) ? "wf_harness_v1" : "paperclip";
}
