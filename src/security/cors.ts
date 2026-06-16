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

  if (options.allowSameOriginWithoutOrigin && headers["sec-fetch-site"] === "same-origin") {
    return {};
  }

  const requestOrigin = readRequestOrigin(headers);
  const refererOrigin = readRefererOrigin(headers.referer);
  if (options.allowSameOriginWithoutOrigin && requestOrigin && refererOrigin === requestOrigin) {
    return {};
  }

  throw new Error("Origin is not allowed");
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
  if (!headers.host) {
    return undefined;
  }

  const protocol = headers["x-forwarded-proto"]?.split(",")[0]?.trim() || "http";
  if (protocol !== "http" && protocol !== "https") {
    return undefined;
  }

  return `${protocol}://${headers.host}`;
}
