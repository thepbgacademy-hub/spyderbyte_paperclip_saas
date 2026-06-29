import { assertWealthFactoryResponse } from "../wealthfactory/response-guard.js";
import type { CustomerSafePlatformLoad } from "../db/supabase-repositories.js";
import { WorkflowRunReservationError } from "../workflows/acid-run-reservation.js";

export type ApiRole = "member" | "operator";

export type ApiSession = {
  userId: string;
  tenantId: string;
  role: ApiRole;
};

export class ApiAuthError extends Error {
  readonly code = "unauthorized";
  readonly publicMessage = "service_unavailable";

  constructor() {
    super("Unauthorized");
    this.name = "ApiAuthError";
  }
}

export class DashboardApiRequestError extends Error {
  readonly code = "invalid_request";
  readonly publicMessage = "invalid_request";

  constructor(message = "Invalid request") {
    super(message);
    this.name = "DashboardApiRequestError";
  }
}

export class DashboardApiConflictError extends Error {
  readonly code = "conflict";
  readonly publicMessage = "conflict";

  constructor(readonly reason: string) {
    super("Workflow run could not be started");
    this.name = "DashboardApiConflictError";
  }
}

export class DashboardApiServiceUnavailableError extends Error {
  readonly code = "service_unavailable";
  readonly publicMessage = "service_unavailable";

  constructor(message = "Workflow start is unavailable") {
    super(message);
    this.name = "DashboardApiServiceUnavailableError";
  }
}

type DashboardApiDeps = {
  authenticate(input: { authorization: string; cookie?: string }): Promise<ApiSession | null>;
  requireTenantMember(input: { tenantId: string; userId: string }): Promise<void>;
  listWorkflows(input: { tenantId: string; userId: string }): Promise<unknown[]>;
  listPackages(input: { tenantId: string; userId: string }): Promise<unknown[]>;
  listArtifacts(input: { tenantId: string; userId: string }): Promise<unknown[]>;
  listProviderConnections(input: { tenantId: string; userId: string }): Promise<unknown[]>;
  listStorageConnectors(input: { tenantId: string; userId: string }): Promise<unknown[]>;
  getPlatformLoad(input: { tenantId: string; userId: string }): Promise<CustomerSafePlatformLoad>;
  startWorkflowRun?: (input: { tenantId: string; userId: string; workflowId: string; freshRun?: boolean }) => Promise<{ runId: string; queued: true }>;
};

export function createDashboardApi(deps: DashboardApiDeps) {
  return {
    async listDashboard(request: { authorization: string; cookie?: string }) {
      const session = await deps.authenticate({ authorization: request.authorization, ...(request.cookie ? { cookie: request.cookie } : {}) });
      if (!session) {
        throw new ApiAuthError();
      }

      await deps.requireTenantMember({ tenantId: session.tenantId, userId: session.userId });

      const [workflows, packages, artifacts, providerConnections, storageConnectors, platformLoad] = await Promise.all([
        deps.listWorkflows({ tenantId: session.tenantId, userId: session.userId }),
        deps.listPackages({ tenantId: session.tenantId, userId: session.userId }),
        deps.listArtifacts({ tenantId: session.tenantId, userId: session.userId }),
        deps.listProviderConnections({ tenantId: session.tenantId, userId: session.userId }),
        deps.listStorageConnectors({ tenantId: session.tenantId, userId: session.userId }),
        deps.getPlatformLoad({ tenantId: session.tenantId, userId: session.userId })
      ]);

      const response = {
        tenantId: session.tenantId,
        role: session.role,
        workflows: toVisibleDashboardWorkflows(workflows),
        packages,
        artifacts,
        providerConnections,
        storageConnectors,
        platformLoad
      };

      assertWealthFactoryResponse(response);
      return response;
    },

    async startWorkflowRun(request: { authorization: string; cookie?: string; workflowId: string; freshRun?: boolean }) {
      const session = await deps.authenticate({ authorization: request.authorization, ...(request.cookie ? { cookie: request.cookie } : {}) });
      if (!session) {
        throw new ApiAuthError();
      }

      await deps.requireTenantMember({ tenantId: session.tenantId, userId: session.userId });

      const workflowId = request.workflowId.trim();
      if (workflowId.length === 0) {
        throw new DashboardApiRequestError();
      }

      const workflows = await deps.listWorkflows({ tenantId: session.tenantId, userId: session.userId });
      const visibleWorkflow = toVisibleDashboardWorkflows(workflows).find((workflow) => String(workflow.id ?? "") === workflowId);
      if (!visibleWorkflow || visibleWorkflow.startEnabled === false) {
        throw new DashboardApiRequestError();
      }

      if (!deps.startWorkflowRun) {
        throw new DashboardApiServiceUnavailableError();
      }

      try {
        const response = await deps.startWorkflowRun({
          tenantId: session.tenantId,
          userId: session.userId,
          workflowId,
          ...(request.freshRun ? { freshRun: true } : {})
        });
        assertWealthFactoryResponse(response);
        return response;
      } catch (error) {
        if (error instanceof WorkflowRunReservationError) {
          throw new DashboardApiConflictError(error.reason);
        }
        console.error("wealth_factory_dashboard_start_failed", {
          tenantId: session.tenantId,
          userId: session.userId,
          workflowId,
          error: error instanceof Error ? error.message : String(error)
        });
        throw error;
      }
    }
  };
}

function toVisibleDashboardWorkflows(workflows: unknown[]): Record<string, unknown>[] {
  return workflows
    .filter((workflow) => workflow && typeof workflow === "object")
    .map((workflow) => workflow as Record<string, unknown>)
    .filter((workflow) => String(workflow.id ?? "").length > 0 && workflow.enabled !== false)
    .map((workflow) => ({
      ...workflow,
      startEnabled: workflow.startEnabled !== false
    }));
}
