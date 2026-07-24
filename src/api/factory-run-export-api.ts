import { TenantMembershipRequiredError } from "../db/supabase-repositories.js";
import {
  assembleFactoryRunLaunchKit,
  FactoryRunExportNotReadyError,
  type FactoryRunLaunchKit
} from "../factory/runs/run-export-application-service.js";
import type { FactoryRunDeliverableRepository } from "../factory/runs/deliverable-repository.js";
import type { FactoryRunApprovalRepository } from "../factory/runs/run-approval-repository.js";

export type FactoryRunExportApiSession = {
  userId: string;
  tenantId: string;
};

export class FactoryRunExportApiError extends Error {
  constructor(readonly code: "unauthorized" | "forbidden" | "not_ready", message: string) {
    super(message);
    this.name = "FactoryRunExportApiError";
  }
}

export type FactoryRunExportApiDeps = {
  authenticate(input: { authorization: string; cookie?: string }): Promise<FactoryRunExportApiSession | null>;
  requireTenantMember(input: { tenantId: string; userId: string }): Promise<void>;
  deliverableRepository: FactoryRunDeliverableRepository;
  approvalRepository: FactoryRunApprovalRepository;
};

type AuthenticatedRequest = {
  authorization: string;
  cookie?: string;
};

export function createFactoryRunExportApi(deps: FactoryRunExportApiDeps) {
  async function createActor(request: AuthenticatedRequest) {
    const session = await deps.authenticate({
      authorization: request.authorization,
      ...(request.cookie ? { cookie: request.cookie } : {})
    });
    if (!session) {
      throw new FactoryRunExportApiError("unauthorized", "Unauthorized");
    }

    await deps.requireTenantMember({
      tenantId: session.tenantId,
      userId: session.userId
    });

    return { userId: session.userId, tenantId: session.tenantId };
  }

  return {
    async exportRun(request: AuthenticatedRequest & { runId: string }): Promise<FactoryRunLaunchKit> {
      const actor = await withApiErrors(() => createActor(request));

      return withApiErrors(() =>
        assembleFactoryRunLaunchKit({
          tenantId: actor.tenantId,
          runId: request.runId,
          deliverableRepository: deps.deliverableRepository,
          approvalRepository: deps.approvalRepository
        })
      );
    }
  };
}

async function withApiErrors<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof FactoryRunExportApiError) {
      throw error;
    }
    if (error instanceof TenantMembershipRequiredError) {
      throw new FactoryRunExportApiError("unauthorized", error.message);
    }
    if (error instanceof FactoryRunExportNotReadyError) {
      throw new FactoryRunExportApiError("not_ready", error.message);
    }
    throw error;
  }
}
