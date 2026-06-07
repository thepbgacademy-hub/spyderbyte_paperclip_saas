import type { DashboardHttpRequest, DashboardHttpResponse } from "./dashboard-http.js";
import { ApiAuthError } from "./dashboard-api.js";
import { assertAllowedOrigin, createSecurityHeaders, validateRequestBodySize } from "../security/cors.js";
import {
  type HarnessAttentionResolutionCommand,
  type HarnessAttentionReviewDecision,
  HarnessActionContractConflictError,
  HarnessCardCreationConflictError,
  HarnessCardProgressionConflictError,
  HarnessRunCompletionConflictError,
  HarnessRunCycleConflictError,
  HarnessWorkflowSelectionError,
  type HarnessBoardResponse,
  type HarnessExportCandidateId,
  type HarnessExportDryRunResult,
  type HarnessExportPreflightResult,
  type HarnessFreshCycleMode
} from "../harness/board-service.js";
import {
  isHarnessCardState,
  isHarnessChildPersona,
  isHarnessDeliverableType,
  normalizeHarnessDeliverableType,
  normalizeHarnessPersona
} from "../harness/types.js";
import { assertWealthFactoryResponse } from "../wealthfactory/response-guard.js";
import type { HarnessCardRecord } from "../harness/types.js";

type HarnessApi = {
  listBoardState(request: { authorization: string; cookie?: string; workflowId?: string }): Promise<HarnessBoardResponse>;
  createTopLevelChildCard(request: {
    authorization: string;
    cookie?: string;
    workflowId?: string;
    persona: string;
    title: string;
    deliverableType: string;
  }): Promise<{ cardId: string } | { status: "deferred"; proposalId: string }>;
  advanceChildCard(request: {
    authorization: string;
    cookie?: string;
    cardId: string;
    state: HarnessCardRecord["state"];
    resultSummary?: string;
    resumeSummary?: string;
  }): Promise<{ cardId: string; state: HarnessCardRecord["state"] }>;
  decideProposal(request: {
    authorization: string;
    cookie?: string;
    proposalId: string;
    decision: "approve" | "defer" | "deny";
    actionToken: string;
    decisionNote?: string;
    targetCardId?: string;
  }): Promise<{ status: "proposed" | "approved" | "deferred" | "denied"; cardId?: string }>;
  completeRun(request: {
    authorization: string;
    cookie?: string;
    runId: string;
    completionSummary: string;
    actionToken: string;
  }): Promise<{ runId: string; state: "done" }>;
  reviewPendingAttention?(request: {
    authorization: string;
    cookie?: string;
    runId: string;
    decision: HarnessAttentionReviewDecision;
    actionToken: string;
    completionSummary?: string;
    mode?: HarnessFreshCycleMode;
  }): Promise<
    | { status: "done"; runId: string }
    | { status: "fresh_cycle_started"; runId: string; reopenedProposalCount: number }
  >;
  resolvePendingAttention?(request: {
    authorization: string;
    cookie?: string;
    runId: string;
    command: HarnessAttentionResolutionCommand;
    actionToken: string;
    resumeSummary?: string;
  }): Promise<
    | { status: "resumed"; cardId: string; state: "working" }
    | { status: "unblocked"; cardId: string; state: "approved" }
  >;
  startFreshCycle?(request: {
    authorization: string;
    cookie?: string;
    runId: string;
    actionToken: string;
    mode?: HarnessFreshCycleMode;
  }): Promise<{ runId: string; reopenedProposalCount: number }>;
  preflightExportCandidate?(request: {
    authorization: string;
    cookie?: string;
    runId: string;
    candidateId: HarnessExportCandidateId;
    actionToken: string;
  }): Promise<HarnessExportPreflightResult>;
  dryRunExportCandidate?(request: {
    authorization: string;
    cookie?: string;
    runId: string;
    candidateId: HarnessExportCandidateId;
    actionToken: string;
  }): Promise<HarnessExportDryRunResult>;
  exportGovernanceHistoryCandidate?(request: {
    authorization: string;
    cookie?: string;
    runId: string;
    candidateId: HarnessExportCandidateId;
    actionToken: string;
  }): Promise<import("../harness/board-service.js").HarnessGovernanceHistoryExportResult>;
  exportPackageBundleCandidate?(request: {
    authorization: string;
    cookie?: string;
    runId: string;
    candidateId: HarnessExportCandidateId;
    actionToken: string;
  }): Promise<import("../harness/board-service.js").HarnessPackageBundleExportResult>;
  replayGovernanceHistoryDeliveryCandidate?(request: {
    authorization: string;
    cookie?: string;
    runId: string;
    candidateId: HarnessExportCandidateId;
    actionToken: string;
  }): Promise<import("../harness/board-service.js").HarnessGovernanceHistoryDeliveryReplayResult>;
  replayPackageBundleDeliveryCandidate?(request: {
    authorization: string;
    cookie?: string;
    runId: string;
    candidateId: HarnessExportCandidateId;
    actionToken: string;
  }): Promise<import("../harness/board-service.js").HarnessPackageBundleDeliveryReplayResult>;
};

type RateLimiter = {
  consume(key: string): Promise<{ allowed: boolean; remaining: number; resetAt: number }>;
};

export function createHarnessHttpHandler(options: {
  allowedOrigins: readonly string[];
  listBoardState: HarnessApi["listBoardState"];
  createTopLevelChildCard: HarnessApi["createTopLevelChildCard"];
  advanceChildCard: HarnessApi["advanceChildCard"];
  decideProposal: HarnessApi["decideProposal"];
  completeRun: HarnessApi["completeRun"];
  reviewPendingAttention?: HarnessApi["reviewPendingAttention"];
  resolvePendingAttention?: HarnessApi["resolvePendingAttention"];
  startFreshCycle?: HarnessApi["startFreshCycle"];
  preflightExportCandidate?: HarnessApi["preflightExportCandidate"];
  dryRunExportCandidate?: HarnessApi["dryRunExportCandidate"];
  exportGovernanceHistoryCandidate?: HarnessApi["exportGovernanceHistoryCandidate"];
  exportPackageBundleCandidate?: HarnessApi["exportPackageBundleCandidate"];
  replayGovernanceHistoryDeliveryCandidate?: HarnessApi["replayGovernanceHistoryDeliveryCandidate"];
  replayPackageBundleDeliveryCandidate?: HarnessApi["replayPackageBundleDeliveryCandidate"];
  rateLimiter: RateLimiter;
  maxBodyBytes?: number;
}) {
  const maxBodyBytes = options.maxBodyBytes ?? 16_384;

  return async function handleHarnessRequest(request: DashboardHttpRequest): Promise<DashboardHttpResponse> {
    const securityHeaders = createSecurityHeaders();
    let corsHeaders: Record<string, string>;
    try {
      corsHeaders = assertAllowedOrigin(request.headers.origin, options.allowedOrigins);
      validateRequestBodySize(request.bodyByteLength, maxBodyBytes);
    } catch {
      return { status: 403, headers: securityHeaders, body: { code: "request_rejected" } };
    }

    if (
      request.method === "OPTIONS" &&
      (
        request.path === "/api/harness/board" ||
        request.path === "/api/harness/cards" ||
        /^\/api\/harness\/cards\/[^/]+\/advance$/u.test(request.path) ||
        /^\/api\/harness\/runs\/[^/]+\/complete$/u.test(request.path) ||
        /^\/api\/harness\/runs\/[^/]+\/review-attention$/u.test(request.path) ||
        /^\/api\/harness\/runs\/[^/]+\/resolve-attention$/u.test(request.path) ||
        /^\/api\/harness\/runs\/[^/]+\/fresh-cycle$/u.test(request.path) ||
        /^\/api\/harness\/runs\/[^/]+\/export-candidates\/[^/]+\/(preflight|dry-run|export|delivery-replay)$/u.test(request.path) ||
        /^\/api\/harness\/proposals\/[^/]+\/(approve|decision)$/u.test(request.path)
      )
    ) {
      return {
        status: 204,
        headers: {
          ...securityHeaders,
          ...corsHeaders,
          "access-control-allow-methods": "GET, POST, OPTIONS",
          "access-control-allow-headers": "authorization, content-type"
        },
        body: null
      };
    }

    const routeKey =
      request.method === "GET" && request.path === "/api/harness/board"
        ? "harness-board"
      : request.method === "POST" && request.path === "/api/harness/cards"
        ? "harness-card-create"
      : request.method === "POST" && /^\/api\/harness\/cards\/[^/]+\/advance$/u.test(request.path)
        ? "harness-card-advance"
      : request.method === "POST" && /^\/api\/harness\/runs\/[^/]+\/complete$/u.test(request.path)
        ? "harness-run-complete"
      : request.method === "POST" && /^\/api\/harness\/runs\/[^/]+\/review-attention$/u.test(request.path)
        ? "harness-run-review-attention"
      : request.method === "POST" && /^\/api\/harness\/runs\/[^/]+\/resolve-attention$/u.test(request.path)
        ? "harness-run-resolve-attention"
      : request.method === "POST" && /^\/api\/harness\/runs\/[^/]+\/fresh-cycle$/u.test(request.path)
        ? "harness-run-fresh-cycle"
      : request.method === "POST" && /^\/api\/harness\/runs\/[^/]+\/export-candidates\/[^/]+\/preflight$/u.test(request.path)
        ? "harness-export-preflight"
      : request.method === "POST" && /^\/api\/harness\/runs\/[^/]+\/export-candidates\/[^/]+\/dry-run$/u.test(request.path)
        ? "harness-export-dry-run"
      : request.method === "POST" && /^\/api\/harness\/runs\/[^/]+\/export-candidates\/[^/]+\/export$/u.test(request.path)
        ? "harness-governance-history-export"
      : request.method === "POST" && /^\/api\/harness\/runs\/[^/]+\/export-candidates\/[^/]+\/delivery-replay$/u.test(request.path)
        ? "harness-governance-history-export-replay"
      : request.method === "POST" && /^\/api\/harness\/proposals\/[^/]+\/(approve|decision)$/u.test(request.path)
        ? "harness-proposal-approve"
      : null;

    if (!routeKey) {
      return { status: 404, headers: { ...securityHeaders, ...corsHeaders }, body: { code: "not_found" } };
    }

    const rateLimit = await options.rateLimiter.consume(`${request.ip}:${routeKey}`);
    if (!rateLimit.allowed) {
      return {
        status: 429,
        headers: { ...securityHeaders, ...corsHeaders, "retry-after": String(retryAfterSeconds(rateLimit.resetAt)) },
        body: { code: "rate_limited" }
      };
    }

    try {
      if (request.method === "GET" && request.path === "/api/harness/board") {
        const workflowId = readOptionalString(request.query?.workflowId);
        const body = await options.listBoardState({
          authorization: request.headers.authorization ?? "",
          ...(workflowId ? { workflowId } : {}),
          ...(request.headers.cookie ? { cookie: request.headers.cookie } : {})
        });
        assertWealthFactoryResponse(body);
        return { status: 200, headers: { ...securityHeaders, ...corsHeaders }, body };
      }

      if (request.method === "POST" && request.path === "/api/harness/cards") {
        const bodyInput = readJsonObject(request.body);
        const persona = normalizeHarnessPersona(readRequiredString(bodyInput?.persona));
        const title = readRequiredString(bodyInput?.title);
        const deliverableType = normalizeHarnessDeliverableType(readRequiredString(bodyInput?.deliverableType));
        const workflowId = readOptionalString(bodyInput?.workflowId);
        if (!persona || !title || !deliverableType || !isHarnessChildPersona(persona) || !isHarnessDeliverableType(deliverableType)) {
          return { status: 400, headers: { ...securityHeaders, ...corsHeaders }, body: { code: "invalid_request" } };
        }

        const body = await options.createTopLevelChildCard({
          authorization: request.headers.authorization ?? "",
          ...(request.headers.cookie ? { cookie: request.headers.cookie } : {}),
          ...(workflowId ? { workflowId } : {}),
          persona,
          title,
          deliverableType
        });
        assertWealthFactoryResponse(body);
        return { status: 200, headers: { ...securityHeaders, ...corsHeaders }, body };
      }

      const advanceMatch = /^\/api\/harness\/cards\/([^/]+)\/advance$/u.exec(request.path);
      if (advanceMatch) {
        const bodyInput = readJsonObject(request.body);
        const state = readRequiredString(bodyInput?.state);
        if (!state || !isHarnessCardState(state)) {
          return { status: 400, headers: { ...securityHeaders, ...corsHeaders }, body: { code: "invalid_request" } };
        }
        const resultSummary = readOptionalString(bodyInput?.resultSummary);
        const resumeSummary = readOptionalString(bodyInput?.resumeSummary);

        const body = await options.advanceChildCard({
          authorization: request.headers.authorization ?? "",
          ...(request.headers.cookie ? { cookie: request.headers.cookie } : {}),
          cardId: decodeURIComponent(advanceMatch[1] ?? ""),
          state,
          ...(resultSummary ? { resultSummary } : {}),
          ...(resumeSummary ? { resumeSummary } : {})
        });
        assertWealthFactoryResponse(body);
        return { status: 200, headers: { ...securityHeaders, ...corsHeaders }, body };
      }

      const completeMatch = /^\/api\/harness\/runs\/([^/]+)\/complete$/u.exec(request.path);
      if (completeMatch) {
        const bodyInput = readJsonObject(request.body);
        const completionSummary = readRequiredString(bodyInput?.completionSummary);
        const actionToken = readRequiredString(bodyInput?.actionToken);
        if (!completionSummary || !actionToken) {
          return { status: 400, headers: { ...securityHeaders, ...corsHeaders }, body: { code: "invalid_request" } };
        }

        const body = await options.completeRun({
          authorization: request.headers.authorization ?? "",
          ...(request.headers.cookie ? { cookie: request.headers.cookie } : {}),
          runId: decodeURIComponent(completeMatch[1] ?? ""),
          completionSummary,
          actionToken
        });
        assertWealthFactoryResponse(body);
        return { status: 200, headers: { ...securityHeaders, ...corsHeaders }, body };
      }

      const reviewAttentionMatch = /^\/api\/harness\/runs\/([^/]+)\/review-attention$/u.exec(request.path);
      if (reviewAttentionMatch) {
        if (!options.reviewPendingAttention) {
          return { status: 404, headers: { ...securityHeaders, ...corsHeaders }, body: { code: "not_found" } };
        }
        const bodyInput = readJsonObject(request.body);
        const decision = readOptionalString(bodyInput?.decision);
        const actionToken = readRequiredString(bodyInput?.actionToken);
        if (decision !== "complete_run" && decision !== "start_fresh_cycle") {
          return { status: 400, headers: { ...securityHeaders, ...corsHeaders }, body: { code: "invalid_request" } };
        }
        if (!actionToken) {
          return { status: 400, headers: { ...securityHeaders, ...corsHeaders }, body: { code: "invalid_request" } };
        }

        const completionSummary = readOptionalString(bodyInput?.completionSummary);
        const freshCycleMode = readOptionalString(bodyInput?.mode);
        if (freshCycleMode && freshCycleMode !== "reopen_deferred" && freshCycleMode !== "clean") {
          return { status: 400, headers: { ...securityHeaders, ...corsHeaders }, body: { code: "invalid_request" } };
        }
        if (decision === "complete_run" && !completionSummary) {
          return { status: 400, headers: { ...securityHeaders, ...corsHeaders }, body: { code: "invalid_request" } };
        }

        const body = await options.reviewPendingAttention({
          authorization: request.headers.authorization ?? "",
          ...(request.headers.cookie ? { cookie: request.headers.cookie } : {}),
          runId: decodeURIComponent(reviewAttentionMatch[1] ?? ""),
          decision,
          actionToken,
          ...(completionSummary ? { completionSummary } : {}),
          ...(freshCycleMode === "reopen_deferred" || freshCycleMode === "clean" ? { mode: freshCycleMode } : {})
        });
        assertWealthFactoryResponse(body);
        return { status: 200, headers: { ...securityHeaders, ...corsHeaders }, body };
      }

      const resolveAttentionMatch = /^\/api\/harness\/runs\/([^/]+)\/resolve-attention$/u.exec(request.path);
      if (resolveAttentionMatch) {
        if (!options.resolvePendingAttention) {
          return { status: 404, headers: { ...securityHeaders, ...corsHeaders }, body: { code: "not_found" } };
        }
        const bodyInput = readJsonObject(request.body);
        const command = readOptionalString(bodyInput?.command);
        const actionToken = readRequiredString(bodyInput?.actionToken);
        if (command !== "resume_lane" && command !== "unblock_lane") {
          return { status: 400, headers: { ...securityHeaders, ...corsHeaders }, body: { code: "invalid_request" } };
        }
        if (!actionToken) {
          return { status: 400, headers: { ...securityHeaders, ...corsHeaders }, body: { code: "invalid_request" } };
        }
        const resumeSummary = readOptionalString(bodyInput?.resumeSummary);

        const body = await options.resolvePendingAttention({
          authorization: request.headers.authorization ?? "",
          ...(request.headers.cookie ? { cookie: request.headers.cookie } : {}),
          runId: decodeURIComponent(resolveAttentionMatch[1] ?? ""),
          command,
          actionToken,
          ...(resumeSummary ? { resumeSummary } : {})
        });
        assertWealthFactoryResponse(body);
        return { status: 200, headers: { ...securityHeaders, ...corsHeaders }, body };
      }

      const freshCycleMatch = /^\/api\/harness\/runs\/([^/]+)\/fresh-cycle$/u.exec(request.path);
      if (freshCycleMatch) {
        if (!options.startFreshCycle) {
          return { status: 404, headers: { ...securityHeaders, ...corsHeaders }, body: { code: "not_found" } };
        }
        const bodyInput = readJsonObject(request.body);
        const actionToken = readRequiredString(bodyInput?.actionToken);
        const freshCycleMode = readOptionalString(bodyInput?.mode);
        if (!actionToken || (freshCycleMode && freshCycleMode !== "reopen_deferred" && freshCycleMode !== "clean")) {
          return { status: 400, headers: { ...securityHeaders, ...corsHeaders }, body: { code: "invalid_request" } };
        }
        const validatedFreshCycleMode: HarnessFreshCycleMode | undefined =
          freshCycleMode === "reopen_deferred" || freshCycleMode === "clean" ? freshCycleMode : undefined;
        const freshCycleRequest: Parameters<NonNullable<typeof options.startFreshCycle>>[0] = {
          authorization: request.headers.authorization ?? "",
          ...(request.headers.cookie ? { cookie: request.headers.cookie } : {}),
          runId: decodeURIComponent(freshCycleMatch[1] ?? ""),
          actionToken
        };
        if (validatedFreshCycleMode) {
          freshCycleRequest.mode = validatedFreshCycleMode;
        }
        const body = await options.startFreshCycle({
          ...freshCycleRequest
        });
        assertWealthFactoryResponse(body);
        return { status: 200, headers: { ...securityHeaders, ...corsHeaders }, body };
      }

      const exportCandidateMatch = /^\/api\/harness\/runs\/([^/]+)\/export-candidates\/([^/]+)\/(preflight|dry-run|export|delivery-replay)$/u.exec(request.path);
      if (exportCandidateMatch) {
        const bodyInput = readJsonObject(request.body);
        const actionToken = readRequiredString(bodyInput?.actionToken);
        if (!actionToken) {
          return { status: 400, headers: { ...securityHeaders, ...corsHeaders }, body: { code: "invalid_request" } };
        }
        const runId = decodeURIComponent(exportCandidateMatch[1] ?? "");
        const candidateId = decodeURIComponent(exportCandidateMatch[2] ?? "") as HarnessExportCandidateId;
        const actionKind = exportCandidateMatch[3];
        if (candidateId !== "governance_history_export" && candidateId !== "package_bundle_export") {
          return { status: 400, headers: { ...securityHeaders, ...corsHeaders }, body: { code: "invalid_request" } };
        }

        if (actionKind === "preflight") {
          if (!options.preflightExportCandidate) {
            return { status: 404, headers: { ...securityHeaders, ...corsHeaders }, body: { code: "not_found" } };
          }
          const body = await options.preflightExportCandidate({
            authorization: request.headers.authorization ?? "",
            ...(request.headers.cookie ? { cookie: request.headers.cookie } : {}),
            runId,
            candidateId,
            actionToken
          });
          assertWealthFactoryResponse(body);
          return { status: 200, headers: { ...securityHeaders, ...corsHeaders }, body };
        }

        if (actionKind === "dry-run") {
          if (!options.dryRunExportCandidate) {
            return { status: 404, headers: { ...securityHeaders, ...corsHeaders }, body: { code: "not_found" } };
          }
          const body = await options.dryRunExportCandidate({
            authorization: request.headers.authorization ?? "",
            ...(request.headers.cookie ? { cookie: request.headers.cookie } : {}),
            runId,
            candidateId,
            actionToken
          });
          assertWealthFactoryResponse(body);
          return { status: 200, headers: { ...securityHeaders, ...corsHeaders }, body };
        }

        if (actionKind === "delivery-replay") {
          const replayHandler = candidateId === "governance_history_export"
            ? options.replayGovernanceHistoryDeliveryCandidate
            : options.replayPackageBundleDeliveryCandidate;
          if (!replayHandler) {
            return { status: 404, headers: { ...securityHeaders, ...corsHeaders }, body: { code: "not_found" } };
          }
          const body = await replayHandler({
            authorization: request.headers.authorization ?? "",
            ...(request.headers.cookie ? { cookie: request.headers.cookie } : {}),
            runId,
            candidateId,
            actionToken
          });
          assertWealthFactoryResponse(body);
          return { status: 200, headers: { ...securityHeaders, ...corsHeaders }, body };
        }

        const exportHandler = candidateId === "governance_history_export"
          ? options.exportGovernanceHistoryCandidate
          : options.exportPackageBundleCandidate;
        if (!exportHandler) {
          return { status: 404, headers: { ...securityHeaders, ...corsHeaders }, body: { code: "not_found" } };
        }
        const body = await exportHandler({
          authorization: request.headers.authorization ?? "",
          ...(request.headers.cookie ? { cookie: request.headers.cookie } : {}),
          runId,
          candidateId,
          actionToken
        });
        assertWealthFactoryResponse(body);
        return { status: 200, headers: { ...securityHeaders, ...corsHeaders }, body };
      }

      const proposalMatch = /^\/api\/harness\/proposals\/([^/]+)\/(approve|decision)$/u.exec(request.path);
      if (!proposalMatch) {
        return { status: 404, headers: { ...securityHeaders, ...corsHeaders }, body: { code: "not_found" } };
      }
      const bodyInput = readJsonObject(request.body);
      const decision = readOptionalString(bodyInput?.decision);
      const actionToken = readRequiredString(bodyInput?.actionToken);
      const routeDecision = proposalMatch[2] === "approve" ? "approve" : decision ?? "";
      if (!routeDecision || !["approve", "defer", "deny"].includes(routeDecision)) {
        return { status: 400, headers: { ...securityHeaders, ...corsHeaders }, body: { code: "invalid_request" } };
      }
      if (!actionToken) {
        return { status: 400, headers: { ...securityHeaders, ...corsHeaders }, body: { code: "invalid_request" } };
      }
      const decisionNote = readOptionalString(bodyInput?.decisionNote);
      const targetCardId = readOptionalString(bodyInput?.targetCardId);

      const body = await options.decideProposal({
        proposalId: decodeURIComponent(proposalMatch[1] ?? ""),
        authorization: request.headers.authorization ?? "",
        ...(request.headers.cookie ? { cookie: request.headers.cookie } : {}),
        decision: routeDecision as "approve" | "defer" | "deny",
        actionToken,
        ...(decisionNote ? { decisionNote } : {}),
        ...(targetCardId ? { targetCardId } : {})
      });
      if (proposalMatch[2] === "approve" && body.status !== "approved") {
        return { status: 409, headers: { ...securityHeaders, ...corsHeaders }, body: { code: "conflict" } };
      }
      assertWealthFactoryResponse(body);
      return { status: 200, headers: { ...securityHeaders, ...corsHeaders }, body };
    } catch (error) {
      if (error instanceof ApiAuthError) {
        return { status: 401, headers: { ...securityHeaders, ...corsHeaders }, body: { code: "unauthorized" } };
      }
      if (error instanceof HarnessWorkflowSelectionError) {
        return { status: 400, headers: { ...securityHeaders, ...corsHeaders }, body: { code: "invalid_request" } };
      }
      if (
        error instanceof HarnessActionContractConflictError
      ) {
        return { status: 409, headers: { ...securityHeaders, ...corsHeaders }, body: { code: "stale_contract" } };
      }
      if (
        error instanceof HarnessCardCreationConflictError ||
        error instanceof HarnessCardProgressionConflictError ||
        error instanceof HarnessRunCompletionConflictError ||
        error instanceof HarnessRunCycleConflictError
      ) {
        return { status: 409, headers: { ...securityHeaders, ...corsHeaders }, body: { code: "conflict" } };
      }

      return { status: 500, headers: { ...securityHeaders, ...corsHeaders }, body: { code: "service_unavailable" } };
    }
  };
}

function readJsonObject(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  return value as Record<string, unknown>;
}

function readRequiredString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function retryAfterSeconds(resetAt: number): number {
  return Math.max(0, Math.ceil((resetAt - Date.now()) / 1000));
}
