import { describe, expect, it } from "vitest";

import { assertAllowedBrowserOrigin, assertAllowedOrigin, createSecurityHeaders, validateRequestBodySize } from "../src/security/cors.js";
import { createFixedWindowRateLimiter } from "../src/security/rate-limit.js";

describe("split-origin security boundary", () => {
  it("allows only configured portal origins", () => {
    expect(assertAllowedOrigin("https://portal.wealthfactory.example", ["https://portal.wealthfactory.example"])).toEqual({
      "access-control-allow-credentials": "true",
      "access-control-allow-origin": "https://portal.wealthfactory.example",
      vary: "Origin"
    });

    expect(() => assertAllowedOrigin("https://untrusted.example", ["https://portal.wealthfactory.example"])).toThrow("Origin is not allowed");
  });

  it("rejects wildcard authenticated CORS", () => {
    expect(() => assertAllowedOrigin("https://portal.wealthfactory.example", ["*"])).toThrow("Wildcard CORS is forbidden");
  });

  it("allows browser requests without Origin only when HTTPS referer matches the request host", () => {
    expect(
      assertAllowedBrowserOrigin(
        {
          host: "wf-api.wealthfactory.example",
          referer: "https://wf-api.wealthfactory.example/board?workflowId=wf_connect_first_workflow"
        },
        ["https://wf-api.wealthfactory.example"],
        { allowSameOriginWithoutOrigin: true }
      )
    ).toEqual({});

    expect(() =>
      assertAllowedBrowserOrigin(
        {
          host: "wf-api.wealthfactory.example",
          "sec-fetch-site": "same-origin"
        },
        ["https://wf-api.wealthfactory.example"],
        { allowSameOriginWithoutOrigin: true }
      )
    ).toThrow("Origin is not allowed");

    expect(() =>
      assertAllowedBrowserOrigin(
        {
          host: "wf-api.wealthfactory.example",
          referer: "https://evil.example/board?workflowId=wf_connect_first_workflow"
        },
        ["https://wf-api.wealthfactory.example"],
        { allowSameOriginWithoutOrigin: true }
      )
    ).toThrow("Origin is not allowed");

    expect(() =>
      assertAllowedBrowserOrigin(
        {
          host: "wf-api.wealthfactory.example",
          referer: "http://wf-api.wealthfactory.example/board?workflowId=wf_connect_first_workflow"
        },
        ["https://wf-api.wealthfactory.example"],
        { allowSameOriginWithoutOrigin: true }
      )
    ).toThrow("Origin is not allowed");
  });

  it("allows browser requests with Origin only when HTTPS origin matches the request host", () => {
    expect(
      assertAllowedBrowserOrigin(
        {
          host: "wf-api.wealthfactory.example",
          origin: "https://wf-api.wealthfactory.example"
        },
        ["https://portal.wealthfactory.example", "https://wf-api.wealthfactory.example"],
        { allowSameOriginWithoutOrigin: true }
      )
    ).toEqual({
      "access-control-allow-credentials": "true",
      "access-control-allow-origin": "https://wf-api.wealthfactory.example",
      vary: "Origin"
    });

    expect(() =>
      assertAllowedBrowserOrigin(
        {
          host: "wf-api.wealthfactory.example",
          origin: "https://wf-api.wealthfactory.example"
        },
        ["https://portal.wealthfactory.example"],
        { allowSameOriginWithoutOrigin: true }
      )
    ).toThrow("Origin is not allowed");

    expect(() =>
      assertAllowedBrowserOrigin(
        {
          host: "wf-api.wealthfactory.example",
          origin: "https://evil.example"
        },
        ["https://portal.wealthfactory.example"],
        { allowSameOriginWithoutOrigin: true }
      )
    ).toThrow("Origin is not allowed");
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
