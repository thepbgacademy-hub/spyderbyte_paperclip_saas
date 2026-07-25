import { TenantMembershipRequiredError } from "../db/supabase-repositories.js";
import type { BlueprintPackageDefinition, Workspace } from "../factory/domain/types.js";
import {
  decideFactoryRunApproval,
  FactoryRunApprovalConflictError,
  FactoryRunApprovalNotFoundError,
  FactoryRunApprovalRevisionCapReachedError,
  type FactoryRunApprovalDecision,
  type FactoryRunOutcome
} from "../factory/runs/run-approval-application-service.js";
import { reviseFactoryRunPositioning } from "../factory/runs/run-driver-application-service.js";
import type { FactoryRunApprovalRepository, FactoryRunApprovalRow } from "../factory/runs/run-approval-repository.js";
import type { FactoryRunDeliverableRepository } from "../factory/runs/deliverable-repository.js";
import type { FactoryRunRepository } from "../factory/runs/run-repository.js";
import type { FactoryPackageInstallRepository } from "../factory/packages/package-install-repository.js";
import { toPackageInstallDomain } from "./factory-run-driver-api.js";
import type { FactoryRunApprovalAuditSink } from "./factory-run-approval-audit.js";

export type FactoryRunApprovalApiSession = {
  userId: string;
  tenantId: string;
};

export class FactoryRunApprovalApiError extends Error {
  constructor(readonly code: "unauthorized" | "forbidden" | "invalid_request" | "not_found" | "conflict", message: string) {
    super(message);
    this.name = "FactoryRunApprovalApiError";
  }
}

export type FactoryRunApprovalDto = {
  runId: string;
  approvalId: string;
  status: "approved" | "changes_requested";
  resolvedAt: string;
  resolutionSummary: string | null;
  runOutcome: FactoryRunOutcome;
};

export type FactoryRunApprovalApiDeps = {
  authenticate(input: { authorization: string; cookie?: string }): Promise<FactoryRunApprovalApiSession | null>;
  requireTenantMember(input: { tenantId: string; userId: string }): Promise<void>;
  repository: FactoryRunApprovalRepository;
  auditSink: FactoryRunApprovalAuditSink;
  packageInstallRepository: FactoryPackageInstallRepository;
  loadBlueprintPackageForInstall(input: {
    packageId: string;
    packageVersionId: string;
  }): Promise<BlueprintPackageDefinition>;
  runRepository: FactoryRunRepository;
  deliverableRepository: FactoryRunDeliverableRepository;
};

type AuthenticatedRequest = {
  authorization: string;
  cookie?: string;
};

export function createFactoryRunApprovalApi(deps: FactoryRunApprovalApiDeps) {
  async function driveRevisionAfterChangesRequested(input: {
    tenantId: string;
    runId: string;
    decidedApproval: FactoryRunApprovalRow;
    decidedAt: string;
  }): Promise<void> {
    const installRow = await deps.packageInstallRepository.findInstallById({
      tenantId: input.tenantId,
      installId: input.decidedApproval.packageInstallId
    });
    if (!installRow) {
      throw new Error(`Blueprint install "${input.decidedApproval.packageInstallId}" was not found`);
    }
    const blueprint = await deps.loadBlueprintPackageForInstall({
      packageId: input.decidedApproval.packageId,
      packageVersionId: input.decidedApproval.packageVersionId
    });
    const workspace: Workspace = {
      id: input.tenantId,
      name: input.tenantId,
      slug: input.tenantId,
      status: "active",
      createdAt: input.decidedAt
    };

    await reviseFactoryRunPositioning({
      workspace,
      packageInstall: toPackageInstallDomain(installRow),
      blueprint,
      runId: input.runId,
      decidedApproval: input.decidedApproval,
      revisionRequestedAt: input.decidedAt,
      runRepository: deps.runRepository,
      deliverableRepository: deps.deliverableRepository,
      approvalRepository: deps.repository
    });
  }

  async function createActor(request: AuthenticatedRequest) {
    const session = await deps.authenticate({
      authorization: request.authorization,
      ...(request.cookie ? { cookie: request.cookie } : {})
    });
    if (!session) {
      throw new FactoryRunApprovalApiError("unauthorized", "Unauthorized");
    }

    await deps.requireTenantMember({
      tenantId: session.tenantId,
      userId: session.userId
    });

    return { userId: session.userId, tenantId: session.tenantId };
  }

  return {
    async decideApproval(
      request: AuthenticatedRequest & {
        runId: string;
        decision: FactoryRunApprovalDecision;
        resolutionSummary?: string;
        decidedAt: string;
      }
    ): Promise<FactoryRunApprovalDto> {
      const actor = await withApiErrors(() => createActor(request));

      const result = await withApiErrors(() =>
        decideFactoryRunApproval({
          tenantId: actor.tenantId,
          runId: request.runId,
          decision: request.decision,
          ...(request.resolutionSummary === undefined ? {} : { resolutionSummary: request.resolutionSummary }),
          decidedAt: request.decidedAt,
          repository: deps.repository
        })
      );

      if (result.runOutcome === "awaiting_revision") {
        await withApiErrors(() =>
          driveRevisionAfterChangesRequested({
            tenantId: actor.tenantId,
            runId: request.runId,
            decidedApproval: result.approval,
            decidedAt: request.decidedAt
          })
        );
      }

      await deps.auditSink({
        tenantId: actor.tenantId,
        actorUserId: actor.userId,
        runId: request.runId,
        approvalId: result.approval.approvalId,
        decision: request.decision
      });

      return {
        runId: request.runId,
        approvalId: result.approval.approvalId,
        status: result.approval.status as "approved" | "changes_requested",
        resolvedAt: result.approval.resolvedAt ?? request.decidedAt,
        resolutionSummary: result.approval.resolutionSummary,
        runOutcome: result.runOutcome
      };
    }
  };
}

async function withApiErrors<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof FactoryRunApprovalApiError) {
      throw error;
    }
    if (error instanceof TenantMembershipRequiredError) {
      throw new FactoryRunApprovalApiError("unauthorized", error.message);
    }
    if (error instanceof FactoryRunApprovalNotFoundError) {
      throw new FactoryRunApprovalApiError("not_found", error.message);
    }
    if (error instanceof FactoryRunApprovalRevisionCapReachedError) {
      throw new FactoryRunApprovalApiError("invalid_request", error.message);
    }
    if (error instanceof FactoryRunApprovalConflictError) {
      throw new FactoryRunApprovalApiError("conflict", error.message);
    }
    if (error instanceof Error && error.message.includes("requires a bounded resolution summary")) {
      throw new FactoryRunApprovalApiError("invalid_request", error.message);
    }
    throw error;
  }
}
