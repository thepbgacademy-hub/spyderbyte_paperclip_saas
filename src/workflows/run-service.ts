import { toPaperclipProviderContext, type PaperclipClient, type PaperclipRunStatus } from "../paperclip/types.js";
import type { EntitlementDecision, ProviderCapability } from "../packages/package-types.js";
import type { ProviderExecutionMode } from "../providers/runtime-provider-fallback.js";
import type { RuntimeProviderExecutionBinding } from "../providers/runtime-provider-execution.js";
import type { RuntimeProviderBinding } from "../providers/runtime-provider-resolution.js";
import { resolveProviderExecutionContext, type DebugSharedProviderResolver } from "./provider-execution-policy.js";

export type TenantPaperclipMapping = {
  paperclipCompanyId: string;
};

export type TenantResolver = (tenantId: string) => Promise<TenantPaperclipMapping>;

export type RunStartAuthorizer = (input: StartWorkflowRunInput) => Promise<boolean>;
export type PaperclipEnabledCheck = (tenantId: string) => Promise<boolean>;
export type RunEntitlementCheck = (input: StartWorkflowRunInput) => Promise<EntitlementDecision>;
export type RuntimeProviderContextResolver = (input: StartWorkflowRunInput) => Promise<readonly RuntimeProviderBinding[]>;
export type RuntimeProviderContextHydrator = (input: StartWorkflowRunInput & { providerBindings: readonly RuntimeProviderBinding[] }) => Promise<
  readonly RuntimeProviderExecutionBinding[]
>;
export type BoundProviderContextLoader = (input: StartWorkflowRunInput) => Promise<readonly RuntimeProviderBinding[] | null>;

export type StartWorkflowRunInput = {
  tenantId: string;
  runId: string;
  workflowId: string;
  createdByUserId?: string;
  requiredCapabilities?: readonly ProviderCapability[];
};

export type PublicWorkflowRunStatus = {
  runId: string;
  workflowId: string;
  status: PaperclipRunStatus;
};

export class WorkflowAuthorizationError extends Error {
  readonly code = "workflow_not_authorized";
  readonly publicMessage = "workflow_failed";

  constructor() {
    super("Workflow run is not authorized for this tenant");
    this.name = "WorkflowAuthorizationError";
  }
}

export class WorkflowAuthorizerMissingError extends Error {
  readonly code = "workflow_authorizer_missing";
  readonly publicMessage = "workflow_failed";

  constructor() {
    super("Workflow run authorizer is required");
    this.name = "WorkflowAuthorizerMissingError";
  }
}

export class PaperclipDisabledError extends Error {
  readonly code = "paperclip_disabled";
  readonly publicMessage = "tenant_paused";

  constructor() {
    super("Paperclip integration is disabled for this tenant");
    this.name = "PaperclipDisabledError";
  }
}

export class WorkflowEntitlementError extends Error {
  readonly code = "workflow_entitlement_denied";
  readonly publicMessage = "workflow_failed";

  constructor(readonly reason: string) {
    super("Workflow entitlement denied");
    this.name = "WorkflowEntitlementError";
  }
}

export function createRunService(options: {
  paperclipClient: Pick<PaperclipClient, "createRun">;
  tenantResolver: TenantResolver;
  authorizeRunStart?: RunStartAuthorizer;
  isPaperclipEnabled?: PaperclipEnabledCheck;
  checkEntitlement?: RunEntitlementCheck;
  providerExecutionMode?: ProviderExecutionMode;
  loadBoundProviderContext?: BoundProviderContextLoader;
  resolveProviderContext?: RuntimeProviderContextResolver;
  hydrateProviderContext?: RuntimeProviderContextHydrator;
  resolveDebugSharedProvider?: DebugSharedProviderResolver;
}) {
  return {
    async startRun(input: StartWorkflowRunInput): Promise<PublicWorkflowRunStatus> {
      if (!options.authorizeRunStart) {
        throw new WorkflowAuthorizerMissingError();
      }

      if (!(await options.authorizeRunStart(input))) {
        throw new WorkflowAuthorizationError();
      }

      if (options.checkEntitlement) {
        const entitlement = await options.checkEntitlement(input);
        if (!entitlement.allowed) {
          throw new WorkflowEntitlementError(entitlement.reason);
        }
      }

      if (options.isPaperclipEnabled && !(await options.isPaperclipEnabled(input.tenantId))) {
        throw new PaperclipDisabledError();
      }

      const tenant = await options.tenantResolver(input.tenantId);
      const providerContext = await resolveProviderExecutionContext({
        mode: options.providerExecutionMode ?? "tenant_credentials_required",
        input,
        ...(options.loadBoundProviderContext ? { loadBoundProviderContext: options.loadBoundProviderContext } : {}),
        ...(options.resolveProviderContext ? { resolveProviderContext: options.resolveProviderContext } : {}),
        ...(options.hydrateProviderContext ? { hydrateProviderContext: options.hydrateProviderContext } : {}),
        ...(options.resolveDebugSharedProvider ? { resolveDebugSharedProvider: options.resolveDebugSharedProvider } : {})
      });
      const paperclipProviderContext = providerContext ? toPaperclipProviderContext(providerContext) : undefined;
      const run = await options.paperclipClient.createRun({
        companyId: tenant.paperclipCompanyId,
        workflowId: input.workflowId,
        spyderbyteRunId: input.runId,
        ...(paperclipProviderContext ? { providerContext: paperclipProviderContext } : {})
      });

      return {
        runId: input.runId,
        workflowId: input.workflowId,
        status: run.status
      };
    }
  };
}
