import type { PaperclipClient, PaperclipRunStatus } from "../paperclip/types.js";
import type { EntitlementDecision } from "../packages/package-types.js";

export type TenantPaperclipMapping = {
  paperclipCompanyId: string;
};

export type TenantResolver = (tenantId: string) => Promise<TenantPaperclipMapping>;

export type RunStartAuthorizer = (input: StartWorkflowRunInput) => Promise<boolean>;
export type PaperclipEnabledCheck = (tenantId: string) => Promise<boolean>;
export type RunEntitlementCheck = (input: StartWorkflowRunInput) => Promise<EntitlementDecision>;

export type StartWorkflowRunInput = {
  tenantId: string;
  runId: string;
  workflowId: string;
  createdByUserId?: string;
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
      const run = await options.paperclipClient.createRun({
        companyId: tenant.paperclipCompanyId,
        workflowId: input.workflowId,
        spyderbyteRunId: input.runId
      });

      return {
        runId: input.runId,
        workflowId: input.workflowId,
        status: run.status
      };
    }
  };
}
