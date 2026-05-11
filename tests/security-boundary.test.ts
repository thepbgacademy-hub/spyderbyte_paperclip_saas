import { describe, expect, it } from "vitest";

import { assertAllowedOrigin, createSecurityHeaders, validateRequestBodySize } from "../src/security/cors.js";
import { createFixedWindowRateLimiter } from "../src/security/rate-limit.js";

describe("split-origin security boundary", () => {
  it("allows only configured portal origins", () => {
    expect(assertAllowedOrigin("https://portal.wealthfactory.example", ["https://portal.wealthfactory.example"])).toEqual({
      "access-control-allow-origin": "https://portal.wealthfactory.example",
      vary: "Origin"
    });

    expect(() => assertAllowedOrigin("https://untrusted.example", ["https://portal.wealthfactory.example"])).toThrow("Origin is not allowed");
  });

  it("rejects wildcard authenticated CORS", () => {
    expect(() => assertAllowedOrigin("https://portal.wealthfactory.example", ["*"])).toThrow("Wildcard CORS is forbidden");
  });

  it("enforces public request size limits", () => {
    expect(validateRequestBodySize(1024, 1024)).toBeUndefined();
    expect(() => validateRequestBodySize(1025, 1024)).toThrow("Request body exceeds the configured limit");
  });

  it("rate limits by route and tenant key", () => {
    const limiter = createFixedWindowRateLimiter({ limit: 2, windowMs: 60_000, now: () => 1_000 });
    expect(limiter.consume("tenant-1:workflow-start")).toMatchObject({ allowed: true, remaining: 1 });
    expect(limiter.consume("tenant-1:workflow-start")).toMatchObject({ allowed: true, remaining: 0 });
    expect(limiter.consume("tenant-1:workflow-start")).toMatchObject({ allowed: false, remaining: 0 });
  });

  it("rejects invalid rate limiter windows", () => {
    expect(() => createFixedWindowRateLimiter({ limit: 2, windowMs: 0 })).toThrow("Rate limit window must be at least 1ms");
  });

  it("defines browser security headers without exposing implementation details", () => {
    expect(createSecurityHeaders()).toMatchObject({
      "x-content-type-options": "nosniff",
      "referrer-policy": "strict-origin-when-cross-origin"
    });
    expect(JSON.stringify(createSecurityHeaders())).not.toMatch(/paperclip|redis|service token/i);
  });
});
