import { assertAllowedBrowserOrigin, createSecurityHeaders, validateRequestBodySize } from "../security/cors.js";
import { FactoryRunDriverApiError, type FactoryRunStatusDto } from "./factory-run-driver-api.js";
import type { DashboardHttpRequest, DashboardHttpResponse } from "./dashboard-http.js";

type RunDriverApi = {
  startRun(request: {
    authorization: string;
    cookie?: string;
    packageInstallId: string;
    answers: { founderName: string; businessName: string; primaryGoal: string; targetAudience: string };
    runId?: string;
    startedAt: string;
  }): Promise<FactoryRunStatusDto>;
  getRunStatus(request: { authorization: string; cookie?: string; runId: string }): Promise<FactoryRunStatusDto>;
};

type RateLimiter = {
  consume(key: string): Promise<{ allowed: boolean; remaining: number; resetAt: number }>;
};

type Route = { action: "start" } | { action: "status"; runId: string } | "invalid" | null;

export function createFactoryRunDriverHttpHandler(options: {
  allowedOrigins: readonly string[];
  runDriverApi: RunDriverApi;
  rateLimiter: RateLimiter;
  maxBodyBytes?: number;
}) {
  const maxBodyBytes = options.maxBodyBytes ?? 16_384;

  return async function handleFactoryRunDriverRequest(request: DashboardHttpRequest): Promise<DashboardHttpResponse> {
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
          "access-control-allow-methods": route.action === "start" ? "POST, OPTIONS" : "GET, OPTIONS",
          "access-control-allow-headers": "authorization, content-type"
        },
        body: null
      };
    }

    if (!route) {
      return { status: 404, headers: { ...securityHeaders, ...corsHeaders }, body: { code: "not_found" } };
    }

    const rateLimit = await options.rateLimiter.consume(`${request.ip}:factory-runs`);
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

    try {
      if (route.action === "start") {
        if (request.method !== "POST") {
          return { status: 404, headers: { ...securityHeaders, ...corsHeaders }, body: { code: "not_found" } };
        }

        const packageInstallId = readRequiredString(request.body, "packageInstallId");
        const answers = readAnswers(request.body);
        const runId = readOptionalString(request.body, "runId");
        const startedAt = readOptionalString(request.body, "startedAt") ?? new Date().toISOString();
        if (!packageInstallId || !answers) {
          return invalidRequest(securityHeaders, corsHeaders);
        }

        const body = await options.runDriverApi.startRun({
          ...auth,
          packageInstallId,
          answers,
          ...(runId ? { runId } : {}),
          startedAt
        });
        return { status: 201, headers: { ...securityHeaders, ...corsHeaders }, body };
      }

      if (request.method !== "GET") {
        return { status: 404, headers: { ...securityHeaders, ...corsHeaders }, body: { code: "not_found" } };
      }

      const body = await options.runDriverApi.getRunStatus({ ...auth, runId: route.runId });
      return ok(body, securityHeaders, corsHeaders);
    } catch (error) {
      return mapApiError(error, securityHeaders, corsHeaders);
    }
  };
}

function parseRoute(path: string): Route {
  if (path === "/api/factory/runs") {
    return { action: "start" };
  }

  const match = /^\/api\/factory\/runs\/([^/]+)$/.exec(path);
  if (!match) {
    return null;
  }
  const runId = safeDecodeURIComponent(match[1] ?? "");
  if (!runId) {
    return "invalid";
  }

  return { action: "status", runId };
}

function safeDecodeURIComponent(value: string): string | null {
  try {
    const decoded = decodeURIComponent(value);
    return decoded.length > 0 ? decoded : null;
  } catch {
    return null;
  }
}

function ok(body: FactoryRunStatusDto, securityHeaders: Record<string, string>, corsHeaders: Record<string, string>) {
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
  if (error instanceof FactoryRunDriverApiError) {
    const status =
      error.code === "unauthorized"
        ? 401
        : error.code === "forbidden"
          ? 403
          : error.code === "not_found"
            ? 404
            : 400;
    return { status, headers: { ...securityHeaders, ...corsHeaders }, body: { code: error.code } };
  }
  return { status: 500, headers: { ...securityHeaders, ...corsHeaders }, body: { code: "service_unavailable" } };
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

function readOptionalString(body: unknown, key: string): string | null {
  return readRequiredString(body, key);
}

function readAnswers(
  body: unknown
): { founderName: string; businessName: string; primaryGoal: string; targetAudience: string } | null {
  if (!body || typeof body !== "object") {
    return null;
  }
  const answers = (body as Record<string, unknown>).answers;
  if (!answers || typeof answers !== "object") {
    return null;
  }
  const founderName = readRequiredString(answers, "founderName");
  const businessName = readRequiredString(answers, "businessName");
  const primaryGoal = readRequiredString(answers, "primaryGoal");
  const targetAudience = readRequiredString(answers, "targetAudience");
  if (!founderName || !businessName || !primaryGoal || !targetAudience) {
    return null;
  }
  return { founderName, businessName, primaryGoal, targetAudience };
}

function retryAfterSeconds(resetAt: number): number {
  return Math.max(0, Math.ceil((resetAt - Date.now()) / 1000));
}
