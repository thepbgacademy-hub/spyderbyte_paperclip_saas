import { assertAllowedBrowserOrigin, createSecurityHeaders, validateRequestBodySize } from "../security/cors.js";
import { FactoryRunApprovalApiError, type FactoryRunApprovalDto } from "./factory-run-approval-api.js";
import type { DashboardHttpRequest, DashboardHttpResponse } from "./dashboard-http.js";

type RunApprovalApi = {
  decideApproval(request: {
    authorization: string;
    cookie?: string;
    runId: string;
    decision: "approve" | "request_changes";
    resolutionSummary?: string;
    decidedAt: string;
  }): Promise<FactoryRunApprovalDto>;
};

type RateLimiter = {
  consume(key: string): Promise<{ allowed: boolean; remaining: number; resetAt: number }>;
};

type Route = { runId: string; action: "approve" | "request-changes" } | "invalid" | null;

export function createFactoryRunApprovalHttpHandler(options: {
  allowedOrigins: readonly string[];
  runApprovalApi: RunApprovalApi;
  rateLimiter: RateLimiter;
  maxBodyBytes?: number;
}) {
  const maxBodyBytes = options.maxBodyBytes ?? 16_384;

  return async function handleFactoryRunApprovalRequest(
    request: DashboardHttpRequest
  ): Promise<DashboardHttpResponse> {
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

    const route = parseRoute(request.path);
    if (route === "invalid") {
      return invalidRequest(securityHeaders, corsHeaders);
    }
    if (request.method === "OPTIONS" && route) {
      return {
        status: 204,
        headers: {
          ...securityHeaders,
          ...corsHeaders,
          "access-control-allow-methods": "POST, OPTIONS",
          "access-control-allow-headers": "authorization, content-type"
        },
        body: null
      };
    }

    if (request.method !== "POST" || !route) {
      return { status: 404, headers: { ...securityHeaders, ...corsHeaders }, body: { code: "not_found" } };
    }

    const rateLimit = await options.rateLimiter.consume(`${request.ip}:factory-run-approvals`);
    if (!rateLimit.allowed) {
      return {
        status: 429,
        headers: { ...securityHeaders, ...corsHeaders, "retry-after": String(retryAfterSeconds(rateLimit.resetAt)) },
        body: { code: "rate_limited" }
      };
    }

    const auth = {
      authorization: request.headers.authorization ?? "",
      ...(request.headers.cookie ? { cookie: request.headers.cookie } : {})
    };

    const decidedAt = readOptionalString(request.body, "decidedAt") ?? new Date().toISOString();

    try {
      if (route.action === "approve") {
        const body = await options.runApprovalApi.decideApproval({
          ...auth,
          runId: route.runId,
          decision: "approve",
          decidedAt
        });
        return ok(body, securityHeaders, corsHeaders);
      }

      const resolutionSummary = readOptionalString(request.body, "resolutionSummary");
      if (!resolutionSummary) {
        return invalidRequest(securityHeaders, corsHeaders);
      }
      const body = await options.runApprovalApi.decideApproval({
        ...auth,
        runId: route.runId,
        decision: "request_changes",
        resolutionSummary,
        decidedAt
      });
      return ok(body, securityHeaders, corsHeaders);
    } catch (error) {
      return mapApiError(error, securityHeaders, corsHeaders);
    }
  };
}

function parseRoute(path: string): Route {
  const match = /^\/api\/factory\/runs\/([^/]+)\/approval\/(approve|request-changes)$/.exec(path);
  if (!match) {
    return null;
  }
  const runId = safeDecodeURIComponent(match[1] ?? "");
  if (!runId) {
    return "invalid";
  }

  return {
    runId,
    action: match[2] as "approve" | "request-changes"
  };
}

function safeDecodeURIComponent(value: string): string | null {
  try {
    const decoded = decodeURIComponent(value);
    return decoded.length > 0 ? decoded : null;
  } catch {
    return null;
  }
}

function ok(body: FactoryRunApprovalDto, securityHeaders: Record<string, string>, corsHeaders: Record<string, string>) {
  return {
    status: 200,
    headers: { ...securityHeaders, ...corsHeaders },
    body
  };
}

function invalidRequest(
  securityHeaders: Record<string, string>,
  corsHeaders: Record<string, string>
): DashboardHttpResponse {
  return { status: 400, headers: { ...securityHeaders, ...corsHeaders }, body: { code: "invalid_request" } };
}

function mapApiError(
  error: unknown,
  securityHeaders: Record<string, string>,
  corsHeaders: Record<string, string>
): DashboardHttpResponse {
  if (error instanceof FactoryRunApprovalApiError) {
    const status =
      error.code === "unauthorized"
        ? 401
        : error.code === "forbidden"
          ? 403
          : error.code === "not_found"
            ? 404
            : error.code === "conflict"
              ? 409
              : 400;
    return { status, headers: { ...securityHeaders, ...corsHeaders }, body: { code: error.code } };
  }
  return { status: 500, headers: { ...securityHeaders, ...corsHeaders }, body: { code: "service_unavailable" } };
}

function readOptionalString(body: unknown, key: string): string | null {
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

function retryAfterSeconds(resetAt: number): number {
  return Math.max(0, Math.ceil((resetAt - Date.now()) / 1000));
}
