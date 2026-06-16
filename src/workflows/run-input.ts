import type { ProviderCapability } from "../packages/package-types.js";

export type StartWorkflowRunInput = {
  tenantId: string;
  runId: string;
  workflowId: string;
  createdByUserId?: string;
  requiredCapabilities?: readonly ProviderCapability[];
};
