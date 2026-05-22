import type { ApiSession } from "./dashboard-api.js";
import type { DashboardHttpRequest, DashboardHttpResponse } from "./dashboard-http.js";
import { assertAllowedOrigin, createSecurityHeaders, validateRequestBodySize } from "../security/cors.js";
import { TenantMembershipRequiredError } from "../db/supabase-repositories.js";
import type { StorageOAuthProviderKind } from "../storage/storage-oauth-service.js";
import { assertWealthFactoryResponse } from "../wealthfactory/response-guard.js";

type StorageOAuthService = {
  isProviderAvailable(providerKind: StorageOAuthProviderKind): boolean;
  begin(input: {
    tenantId: string;
    actorUserId: string;
    providerKind: StorageOAuthProviderKind;
    displayName: string;
    publicTarget: Record<string, unknown>;
  }): Promise<{ authorizationUrl: string; expiresAt: string }>;
  complete(input: { state: string; code: string; providerKind: StorageOAuthProviderKind }): Promise<unknown>;
};

type RateLimiter = {
  consume(key: string): Promise<{ allowed: boolean; remaining: number; resetAt: number }>;
};

export function createStorageOAuthHttpHandler(options: {
  allowedOrigins: readonly string[];
  authenticate(input: { authorization: string; cookie?: string }): Promise<ApiSession | null>;
  requireTenantMember(input: { tenantId: string; userId: string }): Promise<void>;
  storageOAuth: StorageOAuthService;
  rateLimiter: RateLimiter;
  maxBodyBytes?: number;
}) {
  const maxBodyBytes = options.maxBodyBytes ?? 16_384;

  return async function handleStorageOAuthRequest(request: DashboardHttpRequest): Promise<DashboardHttpResponse> {
    const securityHeaders = createSecurityHeaders();
    const route = matchStorageOAuthRoute(request.path);
    let corsHeaders: Record<string, string>;
    try {
      corsHeaders = route?.action === "callback" && !request.headers.origin ? {} : assertAllowedOrigin(request.headers.origin, options.allowedOrigins);
      validateRequestBodySize(request.bodyByteLength, maxBodyBytes);
    } catch {
      return { status: 403, headers: securityHeaders, body: { code: "request_rejected" } };
    }

    if (request.method === "OPTIONS" && request.path.startsWith("/api/storage/oauth/")) {
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

    if (!route || request.method !== "GET") {
      return { status: 404, headers: { ...securityHeaders, ...corsHeaders }, body: { code: "not_found" } };
    }

    const rateLimit = await options.rateLimiter.consume(`${request.ip}:storage-oauth:${route.action}`);
    if (!rateLimit.allowed) {
      return {
        status: 429,
        headers: { ...securityHeaders, ...corsHeaders, "retry-after": String(retryAfterSeconds(rateLimit.resetAt)) },
        body: { code: "rate_limited" }
      };
    }

    try {
      if (route.action === "begin") {
        if (!options.storageOAuth.isProviderAvailable(route.providerKind)) {
          return { status: 503, headers: { ...securityHeaders, ...corsHeaders }, body: { code: "storage_oauth_unavailable" } };
        }
        const session = await options.authenticate({
          authorization: request.headers.authorization ?? "",
          ...(request.headers.cookie ? { cookie: request.headers.cookie } : {})
        });
        if (!session) {
          return { status: 401, headers: { ...securityHeaders, ...corsHeaders }, body: { code: "unauthorized" } };
        }
        await options.requireTenantMember({ tenantId: session.tenantId, userId: session.userId });
        const body = await options.storageOAuth.begin({
          tenantId: session.tenantId,
          actorUserId: session.userId,
          providerKind: route.providerKind,
          displayName: request.query?.displayName ?? defaultDisplayName(route.providerKind),
          publicTarget: request.query?.folderLabel ? { folderLabel: request.query.folderLabel } : {}
        });
        assertWealthFactoryResponse(body);
        return { status: 200, headers: { ...securityHeaders, ...corsHeaders }, body };
      }

      const state = request.query?.state ?? "";
      const code = request.query?.code ?? "";
      if (!state || !code) {
        return { status: 400, headers: { ...securityHeaders, ...corsHeaders }, body: { code: "invalid_oauth_callback" } };
      }
      const body = await options.storageOAuth.complete({ state, code, providerKind: route.providerKind });
      assertWealthFactoryResponse(body);
      return { status: 200, headers: { ...securityHeaders, ...corsHeaders }, body };
    } catch (error) {
      if (error instanceof TenantMembershipRequiredError) {
        return { status: 401, headers: { ...securityHeaders, ...corsHeaders }, body: { code: "unauthorized" } };
      }
      if (error instanceof Error && error.message === "Storage provider is unavailable") {
        return { status: 503, headers: { ...securityHeaders, ...corsHeaders }, body: { code: "storage_oauth_unavailable" } };
      }
      if (
        error instanceof Error &&
        [
          "Storage authorization failed",
          "Storage authorization expired",
          "Storage provider mismatch",
          "Storage authorization did not return offline access",
          "Storage authorization returned an invalid token response",
          "Storage target cannot contain secret-like fields"
        ].includes(error.message)
      ) {
        return { status: 400, headers: { ...securityHeaders, ...corsHeaders }, body: { code: "storage_authorization_failed" } };
      }

      return { status: 500, headers: { ...securityHeaders, ...corsHeaders }, body: { code: "service_unavailable" } };
    }
  };
}

function retryAfterSeconds(resetAt: number): number {
  return Math.max(0, Math.ceil((resetAt - Date.now()) / 1000));
}

function matchStorageOAuthRoute(path: string): { providerKind: StorageOAuthProviderKind; action: "begin" | "callback" } | null {
  const match = path.match(/^\/api\/storage\/oauth\/(google_drive|dropbox)\/(begin|callback)$/);
  if (!match) {
    return null;
  }
  return { providerKind: match[1] as StorageOAuthProviderKind, action: match[2] as "begin" | "callback" };
}

function defaultDisplayName(providerKind: StorageOAuthProviderKind): string {
  return providerKind === "google_drive" ? "Google Drive" : "Dropbox";
}
