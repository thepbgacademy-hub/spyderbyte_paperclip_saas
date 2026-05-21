export type HeaderMap = Record<string, string>;

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
