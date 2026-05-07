export type TenantCheckInput = {
  tenantId: string;
  userId: string;
};

export type TenantWorkflowCheckInput = {
  tenantId: string;
  workflowId: string;
};

export type TenantRunCheckInput = {
  tenantId: string;
  runId: string;
};

export type AuthorizeRunStartInput = {
  tenantId: string;
  workflowId: string;
  runId: string;
  createdByUserId?: string;
};

export type TenantServiceChecks = {
  isTenantMember(input: TenantCheckInput): Promise<boolean>;
  workflowBelongsToTenant(input: TenantWorkflowCheckInput): Promise<boolean>;
  runBelongsToTenant(input: TenantRunCheckInput): Promise<boolean>;
};

export class TenantAccessError extends Error {
  readonly code = "tenant_access_check_failed";
  readonly publicMessage = "workflow_failed";

  constructor() {
    super("Tenant access check failed");
    this.name = "TenantAccessError";
  }
}

export function createTenantService(checks: TenantServiceChecks) {
  return {
    async requireTenantMember(input: TenantCheckInput): Promise<void> {
      let allowed: boolean;
      try {
        allowed = await checks.isTenantMember(input);
      } catch {
        throw new TenantAccessError();
      }

      if (!allowed) {
        throw new TenantAccessError();
      }
    },

    async authorizeRunStart(input: AuthorizeRunStartInput): Promise<boolean> {
      if (!input.createdByUserId) {
        return false;
      }

      try {
        const [isMember, workflowBelongs, runBelongs] = await Promise.all([
          checks.isTenantMember({ tenantId: input.tenantId, userId: input.createdByUserId }),
          checks.workflowBelongsToTenant({ tenantId: input.tenantId, workflowId: input.workflowId }),
          checks.runBelongsToTenant({ tenantId: input.tenantId, runId: input.runId })
        ]);

        return isMember && workflowBelongs && runBelongs;
      } catch {
        return false;
      }
    }
  };
}
