import type { TransactionRunner } from "../db/acid-guard-repository.js";

export type RateLimitDecision = {
  allowed: boolean;
  remaining: number;
  resetAt: number;
};

export function createPostgresFixedWindowRateLimiter(options: {
  runner: TransactionRunner;
  limit: number;
  windowMs: number;
  now?: () => number;
}) {
  if (options.limit < 1) {
    throw new Error("Rate limit must be at least 1");
  }

  if (options.windowMs < 1) {
    throw new Error("Rate limit window must be at least 1ms");
  }

  const now = options.now ?? Date.now;

  return {
    async consume(key: string): Promise<RateLimitDecision> {
      return options.runner.withTransaction(async (transaction) => {
        const currentMs = now();
        const existing = await transaction.query(
          `select bucket_key, request_count, window_started_at
           from wfpc_private.rate_limit_buckets
           where bucket_key = $1
           for update`,
          [key]
        );
        const row = asRecord(existing.rows[0]);
        const windowStartedAt = typeof row.window_started_at === "string" ? Date.parse(row.window_started_at) : Number.NaN;
        const requestCount = Number(row.request_count ?? 0);
        const windowActive = Number.isFinite(windowStartedAt) && currentMs - windowStartedAt < options.windowMs;
        const nextWindowStartedAt = windowActive ? windowStartedAt : currentMs;
        const nextCount = windowActive ? requestCount + 1 : 1;
        const allowed = nextCount <= options.limit;

        await transaction.query(
          `insert into wfpc_private.rate_limit_buckets
            (bucket_key, request_count, window_started_at)
           values ($1, $2, $3::timestamptz)
           on conflict (bucket_key) do update
           set request_count = excluded.request_count,
               window_started_at = excluded.window_started_at,
               updated_at = now()`,
          [key, nextCount, currentIsoFor(nextWindowStartedAt)]
        );

        return {
          allowed,
          remaining: allowed ? Math.max(0, options.limit - nextCount) : 0,
          resetAt: nextWindowStartedAt + options.windowMs
        };
      });
    }
  };
}

function currentIsoFor(timestampMs: number): string {
  return new Date(timestampMs).toISOString();
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}
