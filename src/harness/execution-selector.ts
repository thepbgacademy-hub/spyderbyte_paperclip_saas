export type ExecutionEngine = "paperclip" | "wf_harness_v1";

export interface ExecutionSelectorInput {
  workflowId: string;
  harnessEnabledWorkflowIds: readonly string[];
  harnessEligibleWorkflowIds?: readonly string[];
}

export function selectExecutionEngine(input: ExecutionSelectorInput): ExecutionEngine {
  const eligibleWorkflowIds = new Set(input.harnessEligibleWorkflowIds ?? input.harnessEnabledWorkflowIds);
  if (!eligibleWorkflowIds.has(input.workflowId)) {
    return "paperclip";
  }

  return input.harnessEnabledWorkflowIds.includes(input.workflowId) ? "wf_harness_v1" : "paperclip";
}
