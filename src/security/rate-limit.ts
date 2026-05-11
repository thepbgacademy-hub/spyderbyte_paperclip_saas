export type RateLimitDecision = {
  allowed: boolean;
  remaining: number;
  resetAt: number;
};

export function createFixedWindowRateLimiter(options: { limit: number; windowMs: number; now?: () => number }) {
  if (options.limit < 1) {
    throw new Error("Rate limit must be at least 1");
  }

  if (options.windowMs < 1) {
    throw new Error("Rate limit window must be at least 1ms");
  }

  const buckets = new Map<string, { count: number; windowStart: number }>();
  const now = options.now ?? Date.now;

  return {
    consume(key: string): RateLimitDecision {
      const current = now();
      const bucket = buckets.get(key);
      const activeBucket = bucket && current - bucket.windowStart < options.windowMs ? bucket : { count: 0, windowStart: current };

      if (activeBucket.count >= options.limit) {
        buckets.set(key, activeBucket);
        return { allowed: false, remaining: 0, resetAt: activeBucket.windowStart + options.windowMs };
      }

      activeBucket.count += 1;
      buckets.set(key, activeBucket);
      return {
        allowed: true,
        remaining: Math.max(0, options.limit - activeBucket.count),
        resetAt: activeBucket.windowStart + options.windowMs
      };
    }
  };
}
