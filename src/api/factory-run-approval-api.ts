import { TenantMembershipRequiredError } from "../db/supabase-repositories.js";
import {
  decideFactoryRunApproval,
  FactoryRunApprovalConflictError,
  FactoryRunApprovalNotFoundError,
  FactoryRunApprovalRevisionCapReachedError,
  type FactoryRunApprovalDecision,
  type FactoryRunOutcome
} from "../factory/runs/run-approval-application-service.js";
import type { FactoryRunApprovalRepository } from "../factory/runs/run-approval-repository.js";
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
};

type AuthenticatedRequest = {
  authorization: string;
  cookie?: string;
};

export function createFactoryRunApprovalApi(deps: FactoryRunApprovalApiDeps) {
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
