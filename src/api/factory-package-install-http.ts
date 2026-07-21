import { assertAllowedBrowserOrigin, createSecurityHeaders, validateRequestBodySize } from "../security/cors.js";
import {
  FactoryPackageInstallApiError,
  FactoryPackageInstallPermissionConsentError,
  type FactoryPackageInstallDto
} from "./factory-package-install-api.js";
import type { DashboardHttpRequest, DashboardHttpResponse } from "./dashboard-http.js";

type PackageInstallApi = {
  installPackage(request: {
    authorization: string;
    cookie?: string;
    packageKey: string;
    installId: string;
    installedAt: string;
  }): Promise<FactoryPackageInstallDto>;
  disablePackage(request: {
    authorization: string;
    cookie?: string;
    installId: string;
    disabledAt: string;
  }): Promise<FactoryPackageInstallDto>;
  enablePackage(request: {
    authorization: string;
    cookie?: string;
    installId: string;
    enabledAt: string;
  }): Promise<FactoryPackageInstallDto>;
  updatePackage(request: {
    authorization: string;
    cookie?: string;
    packageKey: string;
    installId: string;
    packageVersionId: string;
    consent?: boolean;
    updatedAt: string;
  }): Promise<FactoryPackageInstallDto>;
  rollbackPackage(request: {
    authorization: string;
    cookie?: string;
    packageKey: string;
    installId: string;
    packageVersionId: string;
    rolledBackAt: string;
  }): Promise<FactoryPackageInstallDto>;
  uninstallPackage(request: {
    authorization: string;
    cookie?: string;
    packageId: string;
    packageKey: string;
    installId: string;
    confirmation: string;
    uninstalledAt: string;
  }): Promise<FactoryPackageInstallDto>;
};

type RateLimiter = {
  consume(key: string): Promise<{ allowed: boolean; remaining: number; resetAt: number }>;
};

type Route =
  | { action: "install" }
  | { action: "disable" | "enable" | "update" | "rollback" | "uninstall"; installId: string }
  | "invalid"
  | null;

export function createFactoryPackageInstallHttpHandler(options: {
  allowedOrigins: readonly string[];
  packageInstallApi: PackageInstallApi;
  rateLimiter: RateLimiter;
  maxBodyBytes?: number;
}) {
  const maxBodyBytes = options.maxBodyBytes ?? 16_384;

  return async function handleFactoryPackageInstallRequest(
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

    const rateLimit = await options.rateLimiter.consume(`${request.ip}:factory-package-installs`);
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
      if (route.action === "install") {
        const packageKey = readRequiredString(request.body, "packageKey");
        const installId = readRequiredString(request.body, "installId");
        const installedAt = readRequiredString(request.body, "installedAt");
        if (!packageKey || !installId || !installedAt) {
          return invalidRequest(securityHeaders, corsHeaders);
        }
        const body = await options.packageInstallApi.installPackage({
          ...auth,
          packageKey,
          installId,
          installedAt
        });
        return { status: 201, headers: { ...securityHeaders, ...corsHeaders }, body };
      }

      if (route.action === "disable") {
        const disabledAt = readRequiredString(request.body, "disabledAt");
        if (!disabledAt) {
          return invalidRequest(securityHeaders, corsHeaders);
        }
        return ok(
          await options.packageInstallApi.disablePackage({ ...auth, installId: route.installId, disabledAt }),
          securityHeaders,
          corsHeaders
        );
      }

      if (route.action === "enable") {
        const enabledAt = readRequiredString(request.body, "enabledAt");
        if (!enabledAt) {
          return invalidRequest(securityHeaders, corsHeaders);
        }
        return ok(
          await options.packageInstallApi.enablePackage({ ...auth, installId: route.installId, enabledAt }),
          securityHeaders,
          corsHeaders
        );
      }

      if (route.action === "update") {
        const packageKey = readRequiredString(request.body, "packageKey");
        const packageVersionId = readRequiredString(request.body, "packageVersionId");
        const updatedAt = readRequiredString(request.body, "updatedAt") ?? new Date().toISOString();
        const consent = readOptionalBoolean(request.body, "consent");
        if (!packageKey || !packageVersionId) {
          return invalidRequest(securityHeaders, corsHeaders);
        }
        return ok(
          await options.packageInstallApi.updatePackage({
            ...auth,
            packageKey,
            installId: route.installId,
            packageVersionId,
            ...(consent === undefined ? {} : { consent }),
            updatedAt
          }),
          securityHeaders,
          corsHeaders
        );
      }

      if (route.action === "rollback") {
        const packageKey = readRequiredString(request.body, "packageKey");
        const packageVersionId = readRequiredString(request.body, "packageVersionId");
        const rolledBackAt = readRequiredString(request.body, "rolledBackAt");
        if (!packageKey || !packageVersionId || !rolledBackAt) {
          return invalidRequest(securityHeaders, corsHeaders);
        }
        return ok(
          await options.packageInstallApi.rollbackPackage({
            ...auth,
            packageKey,
            installId: route.installId,
            packageVersionId,
            rolledBackAt
          }),
          securityHeaders,
          corsHeaders
        );
      }

      const packageId = readRequiredString(request.body, "packageId");
      const packageKey = readRequiredString(request.body, "packageKey");
      const confirmation = readRequiredString(request.body, "confirmation");
      const uninstalledAt = readRequiredString(request.body, "uninstalledAt");
      if (!packageId || !packageKey || !confirmation || !uninstalledAt) {
        return invalidRequest(securityHeaders, corsHeaders);
      }
      return ok(
        await options.packageInstallApi.uninstallPackage({
          ...auth,
          packageId,
          packageKey,
          installId: route.installId,
          confirmation,
          uninstalledAt
        }),
        securityHeaders,
        corsHeaders
      );
    } catch (error) {
      return mapApiError(error, securityHeaders, corsHeaders);
    }
  };
}

function parseRoute(path: string): Route {
  if (path === "/api/factory/package-installs") {
    return { action: "install" };
  }

  const match = /^\/api\/factory\/package-installs\/([^/]+)\/(disable|enable|update|rollback|uninstall)$/.exec(path);
  if (!match) {
    return null;
  }
  const installId = safeDecodeURIComponent(match[1] ?? "");
  if (!installId) {
    return "invalid";
  }

  return {
    installId,
    action: match[2] as "disable" | "enable" | "update" | "rollback" | "uninstall"
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

function ok(body: FactoryPackageInstallDto, securityHeaders: Record<string, string>, corsHeaders: Record<string, string>) {
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
  if (error instanceof FactoryPackageInstallPermissionConsentError) {
    return {
      status: 409,
      headers: { ...securityHeaders, ...corsHeaders },
      body: { code: error.code, permissionDiff: error.permissionDiff }
    };
  }
  if (error instanceof FactoryPackageInstallApiError) {
    const status = error.code === "unauthorized" ? 401 : error.code === "forbidden" ? 403 : 400;
    return { status, headers: { ...securityHeaders, ...corsHeaders }, body: { code: error.code } };
  }
  if (error instanceof Error && isClientValidationError(error.message)) {
    return { status: 400, headers: { ...securityHeaders, ...corsHeaders }, body: { code: "invalid_request" } };
  }
  return { status: 500, headers: { ...securityHeaders, ...corsHeaders }, body: { code: "service_unavailable" } };
}

function isClientValidationError(message: string): boolean {
  return (
    message.includes("does not match requested package") ||
    message.includes("was not found for tenant") ||
    message.includes("must be enabled before") ||
    message.includes("is already on package version") ||
    message.includes("is bound to package") ||
    message.includes("Uninstall confirmation must exactly match") ||
    message.includes("is uninstalled")
  );
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

function readOptionalBoolean(body: unknown, key: string): boolean | undefined {
  if (!body || typeof body !== "object" || !(key in body)) {
    return undefined;
  }
  return (body as Record<string, unknown>)[key] === true;
}

function retryAfterSeconds(resetAt: number): number {
  return Math.max(0, Math.ceil((resetAt - Date.now()) / 1000));
}
