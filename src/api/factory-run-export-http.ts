import { assertAllowedBrowserOrigin, createSecurityHeaders, validateRequestBodySize } from "../security/cors.js";
import { FactoryRunExportApiError } from "./factory-run-export-api.js";
import type { FactoryRunLaunchKit } from "../factory/runs/run-export-application-service.js";
import type { DashboardHttpRequest, DashboardHttpResponse } from "./dashboard-http.js";

type RunExportApi = {
  exportRun(request: { authorization: string; cookie?: string; runId: string }): Promise<FactoryRunLaunchKit>;
};

type RateLimiter = {
  consume(key: string): Promise<{ allowed: boolean; remaining: number; resetAt: number }>;
};

type Route = { runId: string } | "invalid" | null;

export function createFactoryRunExportHttpHandler(options: {
  allowedOrigins: readonly string[];
  runExportApi: RunExportApi;
  rateLimiter: RateLimiter;
  maxBodyBytes?: number;
}) {
  const maxBodyBytes = options.maxBodyBytes ?? 16_384;

  return async function handleFactoryRunExportRequest(request: DashboardHttpRequest): Promise<DashboardHttpResponse> {
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
          "access-control-allow-methods": "GET, OPTIONS",
          "access-control-allow-headers": "authorization, content-type"
        },
        body: null
      };
    }

    if (request.method !== "GET" || !route) {
      return { status: 404, headers: { ...securityHeaders, ...corsHeaders }, body: { code: "not_found" } };
    }

    const rateLimit = await options.rateLimiter.consume(`${request.ip}:factory-run-export`);
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
      const kit = await options.runExportApi.exportRun({ ...auth, runId: route.runId });
      return downloadable(kit, securityHeaders, corsHeaders);
    } catch (error) {
      return mapApiError(error, securityHeaders, corsHeaders);
    }
  };
}

function parseRoute(path: string): Route {
  const match = /^\/api\/factory\/runs\/([^/]+)\/export$/.exec(path);
  if (!match) {
    return null;
  }
  const runId = safeDecodeURIComponent(match[1] ?? "");
  if (!runId) {
    return "invalid";
  }

  return { runId };
}

function safeDecodeURIComponent(value: string): string | null {
  try {
    const decoded = decodeURIComponent(value);
    return decoded.length > 0 ? decoded : null;
  } catch {
    return null;
  }
}

function downloadable(
  kit: FactoryRunLaunchKit,
  securityHeaders: Record<string, string>,
  corsHeaders: Record<string, string>
): DashboardHttpResponse {
  return {
    status: 200,
    headers: {
      ...securityHeaders,
      ...corsHeaders,
      "content-type": "application/json",
      "content-disposition": `attachment; filename="launch-kit-${encodeURIComponent(kit.runId)}.json"`
    },
    body: kit
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
  if (error instanceof FactoryRunExportApiError) {
    const status = error.code === "unauthorized" ? 401 : error.code === "forbidden" ? 403 : 404;
    return { status, headers: { ...securityHeaders, ...corsHeaders }, body: { code: error.code } };
  }
  return { status: 500, headers: { ...securityHeaders, ...corsHeaders }, body: { code: "service_unavailable" } };
}

function retryAfterSeconds(resetAt: number): number {
  return Math.max(0, Math.ceil((resetAt - Date.now()) / 1000));
}
