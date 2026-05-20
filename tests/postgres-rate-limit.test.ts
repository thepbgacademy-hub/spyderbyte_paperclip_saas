import { describe, expect, it, vi } from "vitest";

import { createPostgresFixedWindowRateLimiter } from "../src/security/postgres-rate-limit.js";

describe("postgres fixed-window rate limiter", () => {
  it("records and enforces rate-limit windows transactionally", async () => {
    const transaction = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [
            {
              bucket_key: "203.0.113.9:dashboard",
              request_count: 2,
              window_started_at: "2026-05-19T20:00:00.000Z"
            }
          ]
        })
        .mockResolvedValueOnce({ rows: [] })
    };
    const runner = {
      withTransaction: vi.fn().mockImplementation(async (callback: (client: typeof transaction) => Promise<unknown>) => callback(transaction))
    };
    const limiter = createPostgresFixedWindowRateLimiter({
      runner,
      limit: 2,
      windowMs: 60_000,
      now: () => Date.parse("2026-05-19T20:00:10.000Z")
    });

    await expect(limiter.consume("203.0.113.9:dashboard")).resolves.toEqual({
      allowed: true,
      remaining: 1,
      resetAt: Date.parse("2026-05-19T20:01:10.000Z")
    });
    await expect(limiter.consume("203.0.113.9:dashboard")).resolves.toEqual({
      allowed: false,
      remaining: 0,
      resetAt: Date.parse("2026-05-19T20:01:00.000Z")
    });

    expect(String(transaction.query.mock.calls[0]?.[0])).toMatch(/from wfpc_private\.rate_limit_buckets/i);
    expect(String(transaction.query.mock.calls[1]?.[0])).toMatch(/insert into wfpc_private\.rate_limit_buckets/i);
  });
});
