import type { DashboardHttpRequest, DashboardHttpResponse } from "./dashboard-http.js";
import { ApiAuthError } from "./dashboard-api.js";
import { assertAllowedOrigin, createSecurityHeaders, validateRequestBodySize } from "../security/cors.js";
import {
  HarnessCardCreationConflictError,
  HarnessCardProgressionConflictError,
  HarnessRunCompletionConflictError,
  HarnessRunCycleConflictError,
  type HarnessBoardResponse,
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
  listBoardState(request: { authorization: string; cookie?: string }): Promise<HarnessBoardResponse>;
  createTopLevelChildCard(request: {
    authorization: string;
    cookie?: string;
    persona: string;
    title: string;
    deliverableType: string;
  }): Promise<{ cardId: string }>;
  advanceChildCard(request: {
    authorization: string;
    cookie?: string;
    cardId: string;
    state: HarnessCardRecord["state"];
    resultSummary?: string;
  }): Promise<{ cardId: string; state: HarnessCardRecord["state"] }>;
  decideProposal(request: {
    authorization: string;
    cookie?: string;
    proposalId: string;
    decision: "approve" | "defer" | "deny";
    decisionNote?: string;
    targetCardId?: string;
  }): Promise<{ status: "proposed" | "approved" | "deferred" | "denied"; cardId?: string }>;
  completeRun(request: {
    authorization: string;
    cookie?: string;
    runId: string;
    completionSummary: string;
  }): Promise<{ runId: string; state: "done" }>;
  startFreshCycle?(request: {
    authorization: string;
    cookie?: string;
    runId: string;
    mode?: HarnessFreshCycleMode;
  }): Promise<{ runId: string; reopenedProposalCount: number }>;
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
  startFreshCycle?: HarnessApi["startFreshCycle"];
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
        /^\/api\/harness\/runs\/[^/]+\/fresh-cycle$/u.test(request.path) ||
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
      : request.method === "POST" && /^\/api\/harness\/runs\/[^/]+\/fresh-cycle$/u.test(request.path)
        ? "harness-run-fresh-cycle"
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
        const body = await options.listBoardState({
          authorization: request.headers.authorization ?? "",
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
        if (!persona || !title || !deliverableType || !isHarnessChildPersona(persona) || !isHarnessDeliverableType(deliverableType)) {
          return { status: 400, headers: { ...securityHeaders, ...corsHeaders }, body: { code: "invalid_request" } };
        }

        const body = await options.createTopLevelChildCard({
          authorization: request.headers.authorization ?? "",
          ...(request.headers.cookie ? { cookie: request.headers.cookie } : {}),
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

        const body = await options.advanceChildCard({
          authorization: request.headers.authorization ?? "",
          ...(request.headers.cookie ? { cookie: request.headers.cookie } : {}),
          cardId: decodeURIComponent(advanceMatch[1] ?? ""),
          state,
          ...(resultSummary ? { resultSummary } : {})
        });
        assertWealthFactoryResponse(body);
        return { status: 200, headers: { ...securityHeaders, ...corsHeaders }, body };
      }

      const completeMatch = /^\/api\/harness\/runs\/([^/]+)\/complete$/u.exec(request.path);
      if (completeMatch) {
        const bodyInput = readJsonObject(request.body);
        const completionSummary = readRequiredString(bodyInput?.completionSummary);
        if (!completionSummary) {
          return { status: 400, headers: { ...securityHeaders, ...corsHeaders }, body: { code: "invalid_request" } };
        }

        const body = await options.completeRun({
          authorization: request.headers.authorization ?? "",
          ...(request.headers.cookie ? { cookie: request.headers.cookie } : {}),
          runId: decodeURIComponent(completeMatch[1] ?? ""),
          completionSummary
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
        const freshCycleMode = readOptionalString(bodyInput?.mode);
        if (freshCycleMode && freshCycleMode !== "reopen_deferred" && freshCycleMode !== "clean") {
          return { status: 400, headers: { ...securityHeaders, ...corsHeaders }, body: { code: "invalid_request" } };
        }
        const validatedFreshCycleMode: HarnessFreshCycleMode | undefined =
          freshCycleMode === "reopen_deferred" || freshCycleMode === "clean" ? freshCycleMode : undefined;
        const freshCycleRequest: Parameters<NonNullable<typeof options.startFreshCycle>>[0] = {
          authorization: request.headers.authorization ?? "",
          ...(request.headers.cookie ? { cookie: request.headers.cookie } : {}),
          runId: decodeURIComponent(freshCycleMatch[1] ?? "")
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

      const proposalMatch = /^\/api\/harness\/proposals\/([^/]+)\/(approve|decision)$/u.exec(request.path);
      if (!proposalMatch) {
        return { status: 404, headers: { ...securityHeaders, ...corsHeaders }, body: { code: "not_found" } };
      }
      const bodyInput = readJsonObject(request.body);
      const decision = readOptionalString(bodyInput?.decision);
      const routeDecision = proposalMatch[2] === "approve" ? "approve" : decision ?? "";
      if (!routeDecision || !["approve", "defer", "deny"].includes(routeDecision)) {
        return { status: 400, headers: { ...securityHeaders, ...corsHeaders }, body: { code: "invalid_request" } };
      }
      const decisionNote = readOptionalString(bodyInput?.decisionNote);
      const targetCardId = readOptionalString(bodyInput?.targetCardId);

      const body = await options.decideProposal({
        proposalId: decodeURIComponent(proposalMatch[1] ?? ""),
        authorization: request.headers.authorization ?? "",
        ...(request.headers.cookie ? { cookie: request.headers.cookie } : {}),
        decision: routeDecision as "approve" | "defer" | "deny",
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
