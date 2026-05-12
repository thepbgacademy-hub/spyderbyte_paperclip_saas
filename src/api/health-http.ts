import { assertAllowedOrigin, createSecurityHeaders, validateRequestBodySize } from "../security/cors.js";
import { assertWealthFactoryResponse } from "../wealthfactory/response-guard.js";

export type HealthHttpRequest = {
  method: string;
  path: string;
  headers: Record<string, string | undefined>;
  bodyByteLength: number;
};

export type HealthHttpResponse = {
  status: number;
  headers: Record<string, string>;
  body: unknown;
};

export function createHealthHttpHandler(options: {
  allowedOrigins: readonly string[];
  maxBodyBytes?: number;
  readinessCheck?: () => Promise<void>;
}) {
  const maxBodyBytes = options.maxBodyBytes ?? 8_192;

  return async function handleHealthRequest(request: HealthHttpRequest): Promise<HealthHttpResponse> {
    const securityHeaders = createSecurityHeaders();
    const isHealthPath = request.path === "/health" || request.path === "/api/health";

    if (!isHealthPath) {
      return { status: 404, headers: securityHeaders, body: { code: "not_found" } };
    }

    try {
      validateRequestBodySize(request.bodyByteLength, maxBodyBytes);
    } catch {
      return { status: 413, headers: securityHeaders, body: { code: "request_rejected" } };
    }

    const corsHeaders = resolveCorsHeaders(request.headers.origin, options.allowedOrigins);

    if (request.method === "OPTIONS") {
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

    if (request.method !== "GET") {
      return { status: 405, headers: { ...securityHeaders, ...corsHeaders }, body: { code: "method_not_allowed" } };
    }

    const body = await resolveHealthBody(options.readinessCheck);
    assertWealthFactoryResponse(body);
    return {
      status: body.status === "ok" ? 200 : 503,
      headers: { ...securityHeaders, ...corsHeaders },
      body
    };
  };
}

async function resolveHealthBody(readinessCheck?: () => Promise<void>) {
  if (!readinessCheck) {
    return { status: "ok", service: "wealth_factory_api" } as const;
  }

  try {
    await readinessCheck();
    return { status: "ok", service: "wealth_factory_api" } as const;
  } catch {
    return { status: "degraded", service: "wealth_factory_api" } as const;
  }
}

function resolveCorsHeaders(origin: string | undefined, allowedOrigins: readonly string[]): Record<string, string> {
  if (!origin) {
    return {};
  }

  try {
    return assertAllowedOrigin(origin, allowedOrigins);
  } catch {
    return {};
  }
}
