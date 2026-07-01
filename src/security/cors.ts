export type HeaderMap = Record<string, string>;
export type RequestSecurityHeaders = {
  origin?: string;
  host?: string;
  referer?: string;
  "sec-fetch-site"?: string;
  "x-forwarded-proto"?: string;
};

export function assertAllowedOrigin(origin: string | undefined, allowedOrigins: readonly string[]): HeaderMap {
  if (allowedOrigins.includes("*")) {
    throw new Error("Wildcard CORS is forbidden for authenticated Wealth Factory APIs");
  }

  if (!origin || !allowedOrigins.includes(origin)) {
    throw new Error("Origin is not allowed");
  }

  return {
    "access-control-allow-origin": origin,
    "access-control-allow-credentials": "true",
    vary: "Origin"
  };
}

export function validateRequestBodySize(byteSize: number, maxBytes: number): void {
  if (!Number.isFinite(byteSize) || byteSize < 0) {
    throw new Error("Request body size must be a non-negative number");
  }

  if (byteSize > maxBytes) {
    throw new Error("Request body exceeds the configured limit");
  }
}

export function createSecurityHeaders(): HeaderMap {
  return {
    "x-content-type-options": "nosniff",
    "referrer-policy": "strict-origin-when-cross-origin",
    "x-frame-options": "DENY",
    "content-security-policy": "default-src 'self'; frame-ancestors 'none'; base-uri 'self'"
  };
}

export function assertAllowedBrowserOrigin(
  headers: RequestSecurityHeaders,
  allowedOrigins: readonly string[],
  options: { allowSameOriginWithoutOrigin?: boolean } = {}
): HeaderMap {
  if (headers.origin) {
    return assertAllowedOrigin(headers.origin, allowedOrigins);
  }

  const requestOrigin = readRequestOrigin(headers);
  const refererOrigin = readRefererOrigin(headers.referer);
  if (
    options.allowSameOriginWithoutOrigin &&
    requestOrigin &&
    refererOrigin === requestOrigin &&
    isHttpsOrigin(refererOrigin) &&
    allowedOrigins.includes(refererOrigin)
  ) {
    return {};
  }

  if (
    options.allowSameOriginWithoutOrigin &&
    refererOrigin &&
    isHttpsRefererForRequestHost(headers, refererOrigin) &&
    allowedOrigins.includes(refererOrigin)
  ) {
    return {};
  }

  throw new Error("Origin is not allowed");
}

function isHttpsRefererForRequestHost(headers: RequestSecurityHeaders, refererOrigin: string | undefined): boolean {
  return isHttpsOriginForRequestHost(headers, refererOrigin);
}

function isHttpsOriginForRequestHost(headers: RequestSecurityHeaders, origin: string | undefined): boolean {
  if (!readRequestHost(headers) || !origin) {
    return false;
  }

  try {
    const originUrl = new URL(origin);
    return originUrl.protocol === "https:" && originUrl.host === readRequestHost(headers);
  } catch {
    return false;
  }
}

function isHttpsOrigin(origin: string | undefined): boolean {
  return typeof origin === "string" && origin.startsWith("https://");
}

function readRefererOrigin(referer: string | undefined): string | undefined {
  if (!referer) {
    return undefined;
  }

  try {
    return new URL(referer).origin;
  } catch {
    return undefined;
  }
}

function readRequestOrigin(headers: RequestSecurityHeaders): string | undefined {
  const host = readRequestHost(headers);
  if (!host) {
    return undefined;
  }

  const protocol = headers["x-forwarded-proto"]?.split(",")[0]?.trim() || "http";
  if (protocol !== "http" && protocol !== "https") {
    return undefined;
  }

  return `${protocol}://${host}`;
}

function readRequestHost(headers: RequestSecurityHeaders): string | undefined {
  return headers.host;
}
