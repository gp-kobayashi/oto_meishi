export type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
  retryAfterSeconds: number;
};

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

export class FixedWindowRateLimiter {
  private readonly entries = new Map<string, RateLimitEntry>();
  private operationCount = 0;

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {
    if (!Number.isInteger(limit) || limit < 1) {
      throw new Error("limit must be a positive integer");
    }
    if (!Number.isFinite(windowMs) || windowMs < 1) {
      throw new Error("windowMs must be positive");
    }
  }

  consume(key: string, now = Date.now()): RateLimitResult {
    this.operationCount += 1;
    if (this.operationCount % 100 === 0) {
      this.deleteExpiredEntries(now);
    }

    const current = this.entries.get(key);
    if (!current || now >= current.resetAt) {
      const resetAt = now + this.windowMs;
      this.entries.set(key, { count: 1, resetAt });
      return this.result(true, 1, resetAt, now);
    }

    if (current.count >= this.limit) {
      return this.result(false, current.count, current.resetAt, now);
    }

    current.count += 1;
    return this.result(true, current.count, current.resetAt, now);
  }

  private result(
    allowed: boolean,
    count: number,
    resetAt: number,
    now: number,
  ): RateLimitResult {
    return {
      allowed,
      limit: this.limit,
      remaining: Math.max(0, this.limit - count),
      resetAt,
      retryAfterSeconds: Math.max(1, Math.ceil((resetAt - now) / 1000)),
    };
  }

  private deleteExpiredEntries(now: number) {
    for (const [key, entry] of this.entries) {
      if (now >= entry.resetAt) {
        this.entries.delete(key);
      }
    }
  }
}
