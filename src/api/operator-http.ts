import { assertAllowedBrowserOrigin, createSecurityHeaders, validateRequestBodySize } from "../security/cors.js";
import { OperatorAccessError } from "../operators/operator-service.js";
import type { ApiSession } from "./dashboard-api.js";
import type { DashboardHttpRequest, DashboardHttpResponse } from "./dashboard-http.js";

type OperatorService = {
  pauseTenant(input: { tenantId: string; actorUserId: string; reason: string }): Promise<void>;
  resumeTenant(input: { tenantId: string; actorUserId: string; reason?: string }): Promise<void>;
  inspectJob(input: { tenantId: string; actorUserId: string; jobId: string }): Promise<Record<string, unknown> | null>;
  retryJob(input: { tenantId: string; actorUserId: string; jobId: string; reason?: string }): Promise<void>;
  cancelJob(input: { tenantId: string; actorUserId: string; jobId: string; reason?: string }): Promise<void>;
  cancelRunsBySecretRef(input: { tenantId: string; actorUserId: string; secretRef: string; reason?: string }): Promise<unknown>;
  listDeadLetters(input: { tenantId: string; actorUserId: string }): Promise<Record<string, unknown>[]>;
  rotateSecret(input: { tenantId: string; actorUserId: string; secretRef: string; reason?: string }): Promise<unknown>;
  revokeSecret(input: { tenantId: string; actorUserId: string; secretRef: string; reason?: string }): Promise<void>;
  disablePaperclip(input: { tenantId: string; actorUserId: string; reason: string }): Promise<void>;
};

type RuntimeAuth = {
  authenticate(input: { authorization: string; cookie?: string }): Promise<ApiSession | null>;
};

type RateLimiter = {
  consume(key: string): Promise<{ allowed: boolean; remaining: number; resetAt: number }>;
};

const MAX_OPERATOR_REASON_LENGTH = 500;

export function createOperatorHttpHandler(options: {
  allowedOrigins: readonly string[];
  authenticate: RuntimeAuth["authenticate"];
  operatorService: OperatorService;
  rateLimiter: RateLimiter;
  maxBodyBytes?: number;
}) {
  const maxBodyBytes = options.maxBodyBytes ?? 16_384;

  return async function handleOperatorRequest(request: DashboardHttpRequest): Promise<DashboardHttpResponse> {
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

    if (request.method === "OPTIONS" && request.path.startsWith("/api/operator/")) {
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

    const route = parseOperatorRoute(request.method, request.path);
    if (!route) {
      return { status: 404, headers: { ...securityHeaders, ...corsHeaders }, body: { code: "not_found" } };
    }

    const rateLimit = await options.rateLimiter.consume(`${request.ip}:operator:${route.kind}`);
    if (!rateLimit.allowed) {
      return {
        status: 429,
        headers: { ...securityHeaders, ...corsHeaders, "retry-after": String(retryAfterSeconds(rateLimit.resetAt)) },
        body: { code: "rate_limited" }
      };
    }

    const session = await options.authenticate({
      authorization: request.headers.authorization ?? "",
      ...(request.headers.cookie ? { cookie: request.headers.cookie } : {})
    });
    if (!session) {
      return { status: 403, headers: { ...securityHeaders, ...corsHeaders }, body: { code: "operator_access_denied" } };
    }

    const reason = readOptionalString(readJsonObject(request.body)?.reason);
    if (requiresBoundedReason(route) && (!reason || reason.length > MAX_OPERATOR_REASON_LENGTH)) {
      return { status: 400, headers: { ...securityHeaders, ...corsHeaders }, body: { code: "invalid_request" } };
    }
    const input = { tenantId: session.tenantId, actorUserId: session.userId, ...(reason ? { reason } : {}) };

    try {
      switch (route.kind) {
        case "pause-tenant":
          await options.operatorService.pauseTenant({ tenantId: session.tenantId, actorUserId: session.userId, reason: reason ?? "" });
          return { status: 204, headers: { ...securityHeaders, ...corsHeaders }, body: null };
        case "resume-tenant":
          await options.operatorService.resumeTenant(input);
          return { status: 204, headers: { ...securityHeaders, ...corsHeaders }, body: null };
        case "inspect-job": {
          const job = await options.operatorService.inspectJob({ tenantId: session.tenantId, actorUserId: session.userId, jobId: route.jobId });
          return { status: 200, headers: { ...securityHeaders, ...corsHeaders }, body: { job } };
        }
        case "retry-job":
          await options.operatorService.retryJob({ ...input, jobId: route.jobId });
          return { status: 204, headers: { ...securityHeaders, ...corsHeaders }, body: null };
        case "cancel-job":
          await options.operatorService.cancelJob({ ...input, jobId: route.jobId });
          return { status: 204, headers: { ...securityHeaders, ...corsHeaders }, body: null };
        case "list-dead-letters": {
          const jobs = await options.operatorService.listDeadLetters({ tenantId: session.tenantId, actorUserId: session.userId });
          return { status: 200, headers: { ...securityHeaders, ...corsHeaders }, body: { jobs } };
        }
        case "cancel-runs-by-secret-ref": {
          const bodyInput = readJsonObject(request.body);
          const secretRef = readRequiredString(bodyInput?.secretRef);
          if (!secretRef) {
            return { status: 400, headers: { ...securityHeaders, ...corsHeaders }, body: { code: "invalid_request" } };
          }
          await options.operatorService.cancelRunsBySecretRef({ ...input, secretRef });
          return { status: 204, headers: { ...securityHeaders, ...corsHeaders }, body: null };
        }
        case "rotate-secret": {
          await options.operatorService.rotateSecret({ ...input, secretRef: route.secretRef });
          return { status: 204, headers: { ...securityHeaders, ...corsHeaders }, body: null };
        }
        case "revoke-secret":
          await options.operatorService.revokeSecret({ ...input, secretRef: route.secretRef });
          return { status: 204, headers: { ...securityHeaders, ...corsHeaders }, body: null };
        case "disable-paperclip":
          await options.operatorService.disablePaperclip({ tenantId: session.tenantId, actorUserId: session.userId, reason: reason ?? "" });
          return { status: 204, headers: { ...securityHeaders, ...corsHeaders }, body: null };
      }
    } catch (error) {
      if (error instanceof OperatorAccessError) {
        return { status: 403, headers: { ...securityHeaders, ...corsHeaders }, body: { code: "operator_access_denied" } };
      }
      if (hasErrorCode(error, "operator_operation_not_implemented")) {
        return {
          status: 501,
          headers: { ...securityHeaders, ...corsHeaders },
          body: { code: "operator_operation_not_implemented" }
        };
      }
      return { status: 500, headers: { ...securityHeaders, ...corsHeaders }, body: { code: "service_unavailable" } };
    }
  };
}

type OperatorRoute =
  | { kind: "pause-tenant" }
  | { kind: "resume-tenant" }
  | { kind: "inspect-job"; jobId: string }
  | { kind: "retry-job"; jobId: string }
  | { kind: "cancel-job"; jobId: string }
  | { kind: "list-dead-letters" }
  | { kind: "cancel-runs-by-secret-ref" }
  | { kind: "rotate-secret"; secretRef: string }
  | { kind: "revoke-secret"; secretRef: string }
  | { kind: "disable-paperclip" };

function parseOperatorRoute(method: string, path: string): OperatorRoute | null {
  if (!path.startsWith("/api/operator/tenants/")) {
    return null;
  }

  if (method === "POST" && /^\/api\/operator\/tenants\/[^/]+\/pause$/u.test(path)) {
    return { kind: "pause-tenant" };
  }
  if (method === "POST" && /^\/api\/operator\/tenants\/[^/]+\/resume$/u.test(path)) {
    return { kind: "resume-tenant" };
  }
  if (method === "GET" && /^\/api\/operator\/tenants\/[^/]+\/jobs\/dead-letters$/u.test(path)) {
    return { kind: "list-dead-letters" };
  }
  const inspectJobMatch = /^\/api\/operator\/tenants\/[^/]+\/jobs\/([^/]+)$/u.exec(path);
  if (method === "GET" && inspectJobMatch) {
    return { kind: "inspect-job", jobId: decodeURIComponent(inspectJobMatch[1] ?? "") };
  }
  const retryJobMatch = /^\/api\/operator\/tenants\/[^/]+\/jobs\/([^/]+)\/retry$/u.exec(path);
  if (method === "POST" && retryJobMatch) {
    return { kind: "retry-job", jobId: decodeURIComponent(retryJobMatch[1] ?? "") };
  }
  const cancelJobMatch = /^\/api\/operator\/tenants\/[^/]+\/jobs\/([^/]+)\/cancel$/u.exec(path);
  if (method === "POST" && cancelJobMatch) {
    return { kind: "cancel-job", jobId: decodeURIComponent(cancelJobMatch[1] ?? "") };
  }
  if (method === "POST" && /^\/api\/operator\/tenants\/[^/]+\/runs\/cancel-by-secret-ref$/u.test(path)) {
    return { kind: "cancel-runs-by-secret-ref" };
  }
  const rotateSecretMatch = /^\/api\/operator\/tenants\/[^/]+\/secrets\/([^/]+)\/rotate$/u.exec(path);
  if (method === "POST" && rotateSecretMatch) {
    return { kind: "rotate-secret", secretRef: decodeURIComponent(rotateSecretMatch[1] ?? "") };
  }
  const revokeSecretMatch = /^\/api\/operator\/tenants\/[^/]+\/secrets\/([^/]+)\/revoke$/u.exec(path);
  if (method === "POST" && revokeSecretMatch) {
    return { kind: "revoke-secret", secretRef: decodeURIComponent(revokeSecretMatch[1] ?? "") };
  }
  if (method === "POST" && /^\/api\/operator\/tenants\/[^/]+\/emergency\/disable-paperclip$/u.test(path)) {
    return { kind: "disable-paperclip" };
  }

  return null;
}

function requiresBoundedReason(route: OperatorRoute): boolean {
  return route.kind === "pause-tenant" || route.kind === "disable-paperclip";
}

function hasErrorCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === code
  );
}

function readJsonObject(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function readRequiredString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function retryAfterSeconds(resetAt: number): number {
  return Math.max(0, Math.ceil((resetAt - Date.now()) / 1000));
}
