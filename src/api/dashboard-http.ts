import { assertAllowedOrigin, createSecurityHeaders, validateRequestBodySize } from "../security/cors.js";
import { assertWealthFactoryResponse } from "../wealthfactory/response-guard.js";

export type DashboardHttpRequest = {
  method: string;
  path: string;
  headers: Record<string, string | undefined>;
  query?: Record<string, string>;
  bodyByteLength: number;
  ip: string;
};

export type DashboardHttpResponse = {
  status: number;
  headers: Record<string, string>;
  body: unknown;
};

type DashboardApi = {
  listDashboard(request: { authorization: string }): Promise<unknown>;
};

type RateLimiter = {
  consume(key: string): { allowed: boolean; remaining: number; resetAt: number };
};

export function createDashboardHttpHandler(options: {
  allowedOrigins: readonly string[];
  dashboardApi: DashboardApi;
  rateLimiter: RateLimiter;
  maxBodyBytes?: number;
}) {
  const maxBodyBytes = options.maxBodyBytes ?? 16_384;

  return async function handleDashboardRequest(request: DashboardHttpRequest): Promise<DashboardHttpResponse> {
    const securityHeaders = createSecurityHeaders();
    let corsHeaders: Record<string, string>;
    try {
      corsHeaders = assertAllowedOrigin(request.headers.origin, options.allowedOrigins);
      validateRequestBodySize(request.bodyByteLength, maxBodyBytes);
    } catch {
      return { status: 403, headers: securityHeaders, body: { code: "request_rejected" } };
    }

    if (request.method === "OPTIONS" && request.path === "/api/dashboard") {
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

    if (request.method !== "GET" || request.path !== "/api/dashboard") {
      return { status: 404, headers: { ...securityHeaders, ...corsHeaders }, body: { code: "not_found" } };
    }

    const rateLimit = options.rateLimiter.consume(`${request.ip}:dashboard`);
    if (!rateLimit.allowed) {
      return {
        status: 429,
        headers: { ...securityHeaders, ...corsHeaders, "retry-after": String(Math.ceil((rateLimit.resetAt - Date.now()) / 1000)) },
        body: { code: "rate_limited" }
      };
    }

    try {
      const body = await options.dashboardApi.listDashboard({ authorization: request.headers.authorization ?? "" });
      assertWealthFactoryResponse(body);
      return { status: 200, headers: { ...securityHeaders, ...corsHeaders }, body };
    } catch {
      return { status: 401, headers: { ...securityHeaders, ...corsHeaders }, body: { code: "unauthorized" } };
    }
  };
}
