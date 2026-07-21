import { assertAllowedBrowserOrigin, createSecurityHeaders, validateRequestBodySize } from "../security/cors.js";
import {
  FactoryCredentialApiError,
  type FactoryCredentialDeleteDto,
  type FactoryCredentialDto
} from "./factory-credential-api.js";
import type { DashboardHttpRequest, DashboardHttpResponse } from "./dashboard-http.js";

type CredentialApi = {
  createCredential(request: {
    authorization: string;
    cookie?: string;
    providerKind: string;
    label: string;
    secret: Record<string, string>;
  }): Promise<FactoryCredentialDto>;
  listCredentials(request: { authorization: string; cookie?: string }): Promise<FactoryCredentialDto[]>;
  deleteCredential(request: {
    authorization: string;
    cookie?: string;
    credentialId: string;
  }): Promise<FactoryCredentialDeleteDto>;
};

type RateLimiter = {
  consume(key: string): Promise<{ allowed: boolean; remaining: number; resetAt: number }>;
};

type Route = { action: "create" | "list" } | { action: "delete"; credentialId: string } | "invalid" | null;

export function createFactoryCredentialHttpHandler(options: {
  allowedOrigins: readonly string[];
  credentialApi: CredentialApi;
  rateLimiter: RateLimiter;
  maxBodyBytes?: number;
}) {
  const maxBodyBytes = options.maxBodyBytes ?? 16_384;

  return async function handleFactoryCredentialRequest(request: DashboardHttpRequest): Promise<DashboardHttpResponse> {
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

    const route = parseRoute(request.method, request.path);
    if (route === "invalid") {
      return invalidRequest(securityHeaders, corsHeaders);
    }
    if (request.method === "OPTIONS" && route) {
      return {
        status: 204,
        headers: {
          ...securityHeaders,
          ...corsHeaders,
          "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
          "access-control-allow-headers": "authorization, content-type"
        },
        body: null
      };
    }
    if (!route) {
      return { status: 404, headers: { ...securityHeaders, ...corsHeaders }, body: { code: "not_found" } };
    }

    const rateLimit = await options.rateLimiter.consume(`${request.ip}:factory-credentials`);
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
      if (route.action === "list") {
        return { status: 200, headers: { ...securityHeaders, ...corsHeaders }, body: await options.credentialApi.listCredentials(auth) };
      }
      if (route.action === "create") {
        const providerKind = readRequiredString(request.body, "providerKind");
        const label = readRequiredString(request.body, "label");
        const secret = readSecret(request.body);
        if (!providerKind || !label || !secret) {
          return invalidRequest(securityHeaders, corsHeaders);
        }
        return {
          status: 201,
          headers: { ...securityHeaders, ...corsHeaders },
          body: await options.credentialApi.createCredential({
            ...auth,
            providerKind,
            label,
            secret
          })
        };
      }
      if (route.action === "delete") {
        return {
          status: 200,
          headers: { ...securityHeaders, ...corsHeaders },
          body: await options.credentialApi.deleteCredential({
            ...auth,
            credentialId: route.credentialId
          })
        };
      }
      return invalidRequest(securityHeaders, corsHeaders);
    } catch (error) {
      return mapApiError(error, securityHeaders, corsHeaders);
    }
  };
}

function parseRoute(method: string, path: string): Route {
  if (path === "/api/factory/credentials") {
    if (method === "GET" || method === "OPTIONS") {
      return { action: "list" };
    }
    if (method === "POST") {
      return { action: "create" };
    }
    return null;
  }

  const match = /^\/api\/factory\/credentials\/([^/]+)$/.exec(path);
  if (!match) {
    return null;
  }
  if (method !== "DELETE" && method !== "OPTIONS") {
    return null;
  }
  const credentialId = safeDecodeURIComponent(match[1] ?? "");
  if (!credentialId) {
    return "invalid";
  }
  return { action: "delete", credentialId };
}

function safeDecodeURIComponent(value: string): string | null {
  try {
    const decoded = decodeURIComponent(value);
    return decoded.length > 0 && !decoded.includes("/") && !decoded.includes("\\") ? decoded : null;
  } catch {
    return null;
  }
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
  if (error instanceof FactoryCredentialApiError) {
    const status = error.code === "unauthorized" ? 401 : error.code === "forbidden" ? 403 : 400;
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

function readSecret(body: unknown): Record<string, string> | null {
  if (!body || typeof body !== "object") {
    return null;
  }
  const value = (body as Record<string, unknown>).secret;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const entries = Object.entries(value).filter(
    (entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].trim().length > 0
  );
  return entries.length > 0 ? Object.fromEntries(entries) : null;
}

function retryAfterSeconds(resetAt: number): number {
  return Math.max(0, Math.ceil((resetAt - Date.now()) / 1000));
}
