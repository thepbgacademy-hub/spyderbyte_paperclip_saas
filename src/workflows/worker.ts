import type { PaperclipClient } from "../paperclip/types.js";
import type { PaperclipRunStatus } from "../paperclip/types.js";
import type { ProviderExecutionMode } from "../providers/runtime-provider-fallback.js";
import type {
  PaperclipEnabledCheck,
  RunEntitlementCheck,
  RunStartAuthorizer,
  RuntimeProviderContextHydrator,
  RuntimeProviderContextResolver,
  TenantResolver
} from "./run-service.js";
import { createRunService } from "./run-service.js";
import { validateWorkflowQueuePayload } from "./queue.js";
import type { DebugSharedProviderResolver } from "./provider-execution-policy.js";

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
  providerExecutionMode?: ProviderExecutionMode;
  resolveProviderContext?: RuntimeProviderContextResolver;
  hydrateProviderContext?: RuntimeProviderContextHydrator;
  resolveDebugSharedProvider?: DebugSharedProviderResolver;
  recordStatus?: (status: WorkflowStatusRecord) => void | Promise<void>;
}) {
  const payload = validateWorkflowQueuePayload(options.payload);
  const runService = createRunService({
    paperclipClient: options.paperclipClient,
    tenantResolver: options.tenantResolver,
    authorizeRunStart: options.authorizeRunStart,
    isPaperclipEnabled: options.isPaperclipEnabled,
    checkEntitlement: options.checkEntitlement,
    ...(options.providerExecutionMode ? { providerExecutionMode: options.providerExecutionMode } : {}),
    ...(options.resolveProviderContext ? { resolveProviderContext: options.resolveProviderContext } : {}),
    ...(options.hydrateProviderContext ? { hydrateProviderContext: options.hydrateProviderContext } : {}),
    ...(options.resolveDebugSharedProvider ? { resolveDebugSharedProvider: options.resolveDebugSharedProvider } : {})
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
