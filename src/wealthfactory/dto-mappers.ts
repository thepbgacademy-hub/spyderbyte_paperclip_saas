export type InternalRunRecord = {
  runId: string;
  workflowId: string;
  workflowName: string;
  status: string;
  internal?: unknown;
};

export type WealthFactoryRunSummary = {
  runId: string;
  workflowId: string;
  workflowName: string;
  status: string;
};

export function mapRunToWealthFactorySummary(record: InternalRunRecord): WealthFactoryRunSummary {
  return {
    runId: record.runId,
    workflowId: record.workflowId,
    workflowName: record.workflowName,
    status: record.status
  };
}
