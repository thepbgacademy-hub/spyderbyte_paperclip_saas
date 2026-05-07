import type { PaperclipClient, PaperclipRunStatus } from "../paperclip/types.js";

export type TenantPaperclipMapping = {
  paperclipCompanyId: string;
};

export type TenantResolver = (tenantId: string) => Promise<TenantPaperclipMapping>;

export type RunStartAuthorizer = (input: StartWorkflowRunInput) => Promise<boolean>;

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

export function createRunService(options: {
  paperclipClient: Pick<PaperclipClient, "createRun">;
  tenantResolver: TenantResolver;
  authorizeRunStart?: RunStartAuthorizer;
}) {
  return {
    async startRun(input: StartWorkflowRunInput): Promise<PublicWorkflowRunStatus> {
      if (!options.authorizeRunStart) {
        throw new WorkflowAuthorizerMissingError();
      }

      if (!(await options.authorizeRunStart(input))) {
        throw new WorkflowAuthorizationError();
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
