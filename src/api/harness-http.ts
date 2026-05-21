import type { DashboardHttpRequest, DashboardHttpResponse } from "./dashboard-http.js";
import { ApiAuthError } from "./dashboard-api.js";
import { assertAllowedOrigin, createSecurityHeaders, validateRequestBodySize } from "../security/cors.js";
import type { HarnessBoardResponse } from "../harness/board-service.js";
import { assertWealthFactoryResponse } from "../wealthfactory/response-guard.js";

type HarnessApi = {
  listBoardState(request: { authorization: string; cookie?: string }): Promise<HarnessBoardResponse>;
};

type RateLimiter = {
  consume(key: string): Promise<{ allowed: boolean; remaining: number; resetAt: number }>;
};

export function createHarnessHttpHandler(options: {
  allowedOrigins: readonly string[];
  listBoardState: HarnessApi["listBoardState"];
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

    if (request.method === "OPTIONS" && request.path === "/api/harness/board") {
      return {
        status: 204,
        headers: {
          ...securityHeaders,
          ...corsHeaders,
          "access-control-allow-methods": "GET, OPTIONS",
          "access-control-allow-headers": "authorization, content-type"
        },
        body: null
      };
    }

    if (request.method !== "GET" || request.path !== "/api/harness/board") {
      return { status: 404, headers: { ...securityHeaders, ...corsHeaders }, body: { code: "not_found" } };
    }

    const rateLimit = await options.rateLimiter.consume(`${request.ip}:harness-board`);
    if (!rateLimit.allowed) {
      return {
        status: 429,
        headers: { ...securityHeaders, ...corsHeaders, "retry-after": String(Math.ceil((rateLimit.resetAt - Date.now()) / 1000)) },
        body: { code: "rate_limited" }
      };
    }

    try {
      const body = await options.listBoardState({
        authorization: request.headers.authorization ?? "",
        ...(request.headers.cookie ? { cookie: request.headers.cookie } : {})
      });
      assertWealthFactoryResponse(body);
      return { status: 200, headers: { ...securityHeaders, ...corsHeaders }, body };
    } catch (error) {
      if (error instanceof ApiAuthError) {
        return { status: 401, headers: { ...securityHeaders, ...corsHeaders }, body: { code: "unauthorized" } };
      }

      return { status: 500, headers: { ...securityHeaders, ...corsHeaders }, body: { code: "service_unavailable" } };
    }
  };
}
