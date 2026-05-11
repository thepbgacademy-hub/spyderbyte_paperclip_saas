import type { PaperclipClient } from "../paperclip/types.js";
import type { PaperclipRunStatus } from "../paperclip/types.js";
import type { PaperclipEnabledCheck, RunEntitlementCheck, RunStartAuthorizer, TenantResolver } from "./run-service.js";
import { createRunService } from "./run-service.js";
import { validateWorkflowQueuePayload } from "./queue.js";

type WorkflowStatusRecord = {
  tenantId: string;
  runId: string;
  workflowId: string;
  status: PaperclipRunStatus;
};

export async function processWorkflowJob(options: {
  payload: unknown;
  paperclipClient: Pick<PaperclipClient, "createRun">;
  tenantResolver: TenantResolver;
  authorizeRunStart: RunStartAuthorizer;
  isPaperclipEnabled: PaperclipEnabledCheck;
  checkEntitlement: RunEntitlementCheck;
  recordStatus?: (status: WorkflowStatusRecord) => void | Promise<void>;
}) {
  const payload = validateWorkflowQueuePayload(options.payload);
  const runService = createRunService({
    paperclipClient: options.paperclipClient,
    tenantResolver: options.tenantResolver,
    authorizeRunStart: options.authorizeRunStart,
    isPaperclipEnabled: options.isPaperclipEnabled,
    checkEntitlement: options.checkEntitlement
  });

  try {
    const status = await runService.startRun({
      tenantId: payload.tenantId,
      runId: payload.runId,
      workflowId: payload.workflowId,
      createdByUserId: payload.createdByUserId
    });

    await options.recordStatus?.({
      tenantId: payload.tenantId,
      ...status
    });

    return status;
  } catch (error) {
    await options.recordStatus?.({
      tenantId: payload.tenantId,
      runId: payload.runId,
      workflowId: payload.workflowId,
      status: "failed"
    });
    throw error;
  }
}
