import type { PaperclipRunStatus } from "../paperclip/types.js";

export type WorkflowStatusTransitionRepository = {
  transitionWorkflowRunStatus(input: { tenantId: string; runId: string; from: readonly string[]; to: string }): Promise<{ transitioned: boolean; status?: string }>;
};

export function createAcidWorkflowStatusRecorder(repository: WorkflowStatusTransitionRepository) {
  return async function recordStatus(input: { tenantId: string; runId: string; status: PaperclipRunStatus }) {
    return repository.transitionWorkflowRunStatus({
      tenantId: input.tenantId,
      runId: input.runId,
      from: allowedPreviousStatuses(input.status),
      to: input.status
    });
  };
}

function allowedPreviousStatuses(status: PaperclipRunStatus): readonly string[] {
  switch (status) {
    case "queued":
      return ["queued", "running"];
    case "running":
      return ["queued", "running"];
    case "completed":
      return ["queued", "running"];
    case "failed":
      return ["queued", "running"];
    case "cancelled":
      return ["queued", "running"];
  }
}
