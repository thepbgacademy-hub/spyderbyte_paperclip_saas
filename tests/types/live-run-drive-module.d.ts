declare module "../../scripts/lib/live-run-drive.mjs" {
  export type LiveRunRequest = {
    tenantId: string;
    userId: string;
    workflowId: string;
    workflowTemplateId?: string;
    runId?: string;
    skipExistingHarnessReuse?: boolean;
  };

  export type ProviderContextSnapshot = {
    capability: string;
    providerKind: string;
    label: string;
    secretRef: string;
    metadata: Record<string, unknown>;
  };

  export type WorkflowRunSnapshot = {
    run: {
      id: string;
      status: string;
      boundSecretReferenceId: string;
      providerContext: ProviderContextSnapshot[];
    };
    outbox: {
      id: string;
      status: string;
      attempts: number;
      lastError: string | null;
    };
  };

  export type WorkflowQueueSnapshot = {
    queueName: string;
    jobId: string;
    state: string | null;
  };

  export function createLiveRunRequest(input: LiveRunRequest): {
    tenantId: string;
    userId: string;
    workflowId: string;
    workflowTemplateId?: string;
    runId: string;
    idempotencyKey: string;
    skipExistingHarnessReuse?: boolean;
  };

  export function loadWorkflowRunSnapshot(input: {
    client: {
      query(sql: string, values: readonly unknown[]): Promise<{ rows: unknown[] }>;
    };
    tenantId: string;
    runId: string;
  }): Promise<WorkflowRunSnapshot>;

  export function summarizeWorkflowRunVerification(input: {
    snapshot: WorkflowRunSnapshot;
    queue: WorkflowQueueSnapshot;
  }): {
    ok: boolean;
    phase: string;
    notes: string[];
  };
}
