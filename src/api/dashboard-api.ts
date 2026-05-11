import { assertWealthFactoryResponse } from "../wealthfactory/response-guard.js";

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

type DashboardApiDeps = {
  authenticate(input: { authorization: string }): Promise<ApiSession | null>;
  requireTenantMember(input: { tenantId: string; userId: string }): Promise<void>;
  listWorkflows(input: { tenantId: string; userId: string }): Promise<unknown[]>;
  listPackages(input: { tenantId: string; userId: string }): Promise<unknown[]>;
  listArtifacts(input: { tenantId: string; userId: string }): Promise<unknown[]>;
  listProviderConnections(input: { tenantId: string; userId: string }): Promise<unknown[]>;
};

export function createDashboardApi(deps: DashboardApiDeps) {
  return {
    async listDashboard(request: { authorization: string }) {
      const session = await deps.authenticate({ authorization: request.authorization });
      if (!session) {
        throw new ApiAuthError();
      }

      await deps.requireTenantMember({ tenantId: session.tenantId, userId: session.userId });

      const [workflows, packages, artifacts, providerConnections] = await Promise.all([
        deps.listWorkflows({ tenantId: session.tenantId, userId: session.userId }),
        deps.listPackages({ tenantId: session.tenantId, userId: session.userId }),
        deps.listArtifacts({ tenantId: session.tenantId, userId: session.userId }),
        deps.listProviderConnections({ tenantId: session.tenantId, userId: session.userId })
      ]);

      const response = {
        tenantId: session.tenantId,
        role: session.role,
        workflows,
        packages,
        artifacts,
        providerConnections
      };

      assertWealthFactoryResponse(response);
      return response;
    }
  };
}
