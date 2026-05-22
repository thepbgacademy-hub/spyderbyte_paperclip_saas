import type { DashboardHttpRequest, DashboardHttpResponse } from "./dashboard-http.js";
import { ApiAuthError } from "./dashboard-api.js";
import { assertAllowedOrigin, createSecurityHeaders, validateRequestBodySize } from "../security/cors.js";
import {
  HarnessCardCreationConflictError,
  HarnessCardProgressionConflictError,
  type HarnessBoardResponse
} from "../harness/board-service.js";
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
  approveProposal(request: { authorization: string; cookie?: string; proposalId: string }): Promise<{ cardId: string }>;
};

type RateLimiter = {
  consume(key: string): Promise<{ allowed: boolean; remaining: number; resetAt: number }>;
};

export function createHarnessHttpHandler(options: {
  allowedOrigins: readonly string[];
  listBoardState: HarnessApi["listBoardState"];
  createTopLevelChildCard: HarnessApi["createTopLevelChildCard"];
  advanceChildCard: HarnessApi["advanceChildCard"];
  approveProposal: HarnessApi["approveProposal"];
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
        request.path.startsWith("/api/harness/proposals/")
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

    if (
      request.method !== "GET" &&
      !(
        request.method === "POST" &&
        (
          request.path === "/api/harness/cards" ||
          /^\/api\/harness\/cards\/[^/]+\/advance$/u.test(request.path) ||
          request.path.startsWith("/api/harness/proposals/")
        )
      )
    ) {
      return { status: 404, headers: { ...securityHeaders, ...corsHeaders }, body: { code: "not_found" } };
    }

    const routeKey =
      request.path === "/api/harness/board"
        ? "harness-board"
        : /^\/api\/harness\/cards\/[^/]+\/advance$/u.test(request.path)
          ? "harness-card-advance"
        : request.path === "/api/harness/cards"
          ? "harness-card-create"
          : "harness-proposal-approve";
    const rateLimit = await options.rateLimiter.consume(`${request.ip}:${routeKey}`);
    if (!rateLimit.allowed) {
      return {
        status: 429,
        headers: { ...securityHeaders, ...corsHeaders, "retry-after": String(Math.ceil((rateLimit.resetAt - Date.now()) / 1000)) },
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
        const persona = request.query?.persona?.trim() ?? "";
        const title = request.query?.title?.trim() ?? "";
        const deliverableType = request.query?.deliverableType?.trim() ?? "";
        if (!persona || !title || !deliverableType) {
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
        const state = request.query?.state?.trim() ?? "";
        const resultSummary = request.query?.resultSummary?.trim();
        if (!state) {
          return { status: 400, headers: { ...securityHeaders, ...corsHeaders }, body: { code: "invalid_request" } };
        }

        const body = await options.advanceChildCard({
          authorization: request.headers.authorization ?? "",
          ...(request.headers.cookie ? { cookie: request.headers.cookie } : {}),
          cardId: decodeURIComponent(advanceMatch[1] ?? ""),
          state: state as HarnessCardRecord["state"],
          ...(resultSummary ? { resultSummary } : {})
        });
        assertWealthFactoryResponse(body);
        return { status: 200, headers: { ...securityHeaders, ...corsHeaders }, body };
      }

      const proposalMatch = /^\/api\/harness\/proposals\/([^/]+)\/approve$/u.exec(request.path);
      if (!proposalMatch) {
        return { status: 404, headers: { ...securityHeaders, ...corsHeaders }, body: { code: "not_found" } };
      }

      const body = await options.approveProposal({
        proposalId: decodeURIComponent(proposalMatch[1] ?? ""),
        authorization: request.headers.authorization ?? "",
        ...(request.headers.cookie ? { cookie: request.headers.cookie } : {})
      });
      assertWealthFactoryResponse(body);
      return { status: 200, headers: { ...securityHeaders, ...corsHeaders }, body };
    } catch (error) {
      if (error instanceof ApiAuthError) {
        return { status: 401, headers: { ...securityHeaders, ...corsHeaders }, body: { code: "unauthorized" } };
      }
      if (error instanceof HarnessCardCreationConflictError || error instanceof HarnessCardProgressionConflictError) {
        return { status: 409, headers: { ...securityHeaders, ...corsHeaders }, body: { code: "conflict" } };
      }

      return { status: 500, headers: { ...securityHeaders, ...corsHeaders }, body: { code: "service_unavailable" } };
    }
  };
}
