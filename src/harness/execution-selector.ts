export type ExecutionEngine = "paperclip" | "wf_harness_v1" | "wf_native_v1";

export interface ExecutionSelectorInput {
  workflowId: string;
  harnessEnabledWorkflowIds: readonly string[];
  nativeExecutorEnabledWorkflowIds?: readonly string[];
  harnessEligibleWorkflowIds?: readonly string[];
  nativeDefaultWorkflowIds?: readonly string[];
}

export function selectExecutionEngine(input: ExecutionSelectorInput): ExecutionEngine {
  const eligibleWorkflowIds = new Set(input.harnessEligibleWorkflowIds ?? input.harnessEnabledWorkflowIds);
  const harnessEnabled = input.harnessEnabledWorkflowIds.includes(input.workflowId);
  if (!eligibleWorkflowIds.has(input.workflowId) || !harnessEnabled) {
    return "paperclip";
  }

  if (
    input.nativeExecutorEnabledWorkflowIds?.includes(input.workflowId) ||
    input.nativeDefaultWorkflowIds?.includes(input.workflowId)
  ) {
    return "wf_native_v1";
  }

  return input.harnessEnabledWorkflowIds.includes(input.workflowId) ? "wf_harness_v1" : "paperclip";
}

export function isPaperclipExecutionRequired(input: {
  configuredWorkflowIds: readonly string[];
  harnessEnabledWorkflowIds: readonly string[];
  nativeExecutorEnabledWorkflowIds?: readonly string[];
  harnessEligibleWorkflowIds?: readonly string[];
  nativeDefaultWorkflowIds?: readonly string[];
}): boolean {
  return input.configuredWorkflowIds.some(
    (workflowId) =>
      selectExecutionEngine({
        workflowId,
        harnessEnabledWorkflowIds: input.harnessEnabledWorkflowIds,
        ...(input.nativeExecutorEnabledWorkflowIds ? { nativeExecutorEnabledWorkflowIds: input.nativeExecutorEnabledWorkflowIds } : {}),
        ...(input.harnessEligibleWorkflowIds ? { harnessEligibleWorkflowIds: input.harnessEligibleWorkflowIds } : {}),
        ...(input.nativeDefaultWorkflowIds ? { nativeDefaultWorkflowIds: input.nativeDefaultWorkflowIds } : {})
      }) === "paperclip"
  );
}
