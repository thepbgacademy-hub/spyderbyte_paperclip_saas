import { assertAllowedBrowserOrigin, createSecurityHeaders, validateRequestBodySize } from "../security/cors.js";
import {
  ApiAuthError,
  DashboardApiConflictError,
  DashboardApiRequestError,
  DashboardApiServiceUnavailableError
} from "./dashboard-api.js";
import { assertWealthFactoryResponse } from "../wealthfactory/response-guard.js";

export type DashboardHttpRequest = {
  method: string;
  path: string;
  headers: Record<string, string | undefined>;
  query?: Record<string, string>;
  body?: unknown;
  bodyByteLength: number;
  ip: string;
};

export type DashboardHttpResponse = {
  status: number;
  headers: Record<string, string>;
  body: unknown;
};

type DashboardApi = {
  listDashboard(request: { authorization: string; cookie?: string }): Promise<unknown>;
  startWorkflowRun(request: { authorization: string; cookie?: string; workflowId: string; freshRun?: boolean }): Promise<unknown>;
};

type RateLimiter = {
  consume(key: string): Promise<{ allowed: boolean; remaining: number; resetAt: number }>;
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
      corsHeaders = assertAllowedBrowserOrigin(request.headers, options.allowedOrigins, {
        allowSameOriginWithoutOrigin: request.method !== "OPTIONS"
      });
      validateRequestBodySize(request.bodyByteLength, maxBodyBytes);
    } catch {
      return { status: 403, headers: securityHeaders, body: { code: "request_rejected" } };
    }

    if (request.method === "OPTIONS" && (request.path === "/api/dashboard" || request.path === "/api/dashboard/runs")) {
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

    if (request.method === "GET" && request.path === "/api/dashboard") {
      const rateLimit = await options.rateLimiter.consume(`${request.ip}:dashboard`);
      if (!rateLimit.allowed) {
        return {
          status: 429,
          headers: { ...securityHeaders, ...corsHeaders, "retry-after": String(retryAfterSeconds(rateLimit.resetAt)) },
          body: { code: "rate_limited" }
        };
      }

      try {
        const body = await options.dashboardApi.listDashboard({
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
    }

    if (request.method === "POST" && request.path === "/api/dashboard/runs") {
      const rateLimit = await options.rateLimiter.consume(`${request.ip}:dashboard-runs`);
      if (!rateLimit.allowed) {
        return {
          status: 429,
          headers: { ...securityHeaders, ...corsHeaders, "retry-after": String(retryAfterSeconds(rateLimit.resetAt)) },
          body: { code: "rate_limited" }
        };
      }

      const workflowId = readRequiredString(request.body, "workflowId");
      const freshRun = readOptionalBoolean(request.body, "freshRun");
      if (!workflowId) {
        return { status: 400, headers: { ...securityHeaders, ...corsHeaders }, body: { code: "invalid_request" } };
      }

      try {
        const body = await options.dashboardApi.startWorkflowRun({
          authorization: request.headers.authorization ?? "",
          ...(request.headers.cookie ? { cookie: request.headers.cookie } : {}),
          workflowId,
          ...(freshRun ? { freshRun: true } : {})
        });
        assertWealthFactoryResponse(body);
        return { status: 202, headers: { ...securityHeaders, ...corsHeaders }, body };
      } catch (error) {
        if (error instanceof ApiAuthError) {
          return { status: 401, headers: { ...securityHeaders, ...corsHeaders }, body: { code: "unauthorized" } };
        }
        if (error instanceof DashboardApiRequestError) {
          return { status: 400, headers: { ...securityHeaders, ...corsHeaders }, body: { code: error.code } };
        }
        if (error instanceof DashboardApiConflictError) {
          return { status: 409, headers: { ...securityHeaders, ...corsHeaders }, body: { code: error.code } };
        }
        if (error instanceof DashboardApiServiceUnavailableError) {
          return { status: 503, headers: { ...securityHeaders, ...corsHeaders }, body: { code: error.code } };
        }
        if (hasErrorCode(error, "invalid_request")) {
          return { status: 400, headers: { ...securityHeaders, ...corsHeaders }, body: { code: "invalid_request" } };
        }
        if (hasErrorCode(error, "conflict")) {
          return { status: 409, headers: { ...securityHeaders, ...corsHeaders }, body: { code: "conflict" } };
        }
        if (hasErrorCode(error, "service_unavailable")) {
          return { status: 503, headers: { ...securityHeaders, ...corsHeaders }, body: { code: "service_unavailable" } };
        }
        return { status: 500, headers: { ...securityHeaders, ...corsHeaders }, body: { code: "service_unavailable" } };
      }
    }

    {
      return { status: 404, headers: { ...securityHeaders, ...corsHeaders }, body: { code: "not_found" } };
    }
  };
}

function readRequiredString(body: unknown, key: string): string | null {
  if (!body || typeof body !== "object") {
    return null;
  }
  const value = (body as Record<string, unknown>)[key];
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function hasErrorCode(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === code;
}

function readOptionalBoolean(body: unknown, key: string): boolean {
  if (!body || typeof body !== "object") {
    return false;
  }
  return (body as Record<string, unknown>)[key] === true;
}

function retryAfterSeconds(resetAt: number): number {
  return Math.max(0, Math.ceil((resetAt - Date.now()) / 1000));
}
