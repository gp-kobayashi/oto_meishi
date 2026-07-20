import { describe, expect, it } from "vitest";
import { FixedWindowRateLimiter } from "@/lib/rateLimit";

describe("FixedWindowRateLimiter", () => {
  it("指定回数までは許可し、残り回数を返す", () => {
    const limiter = new FixedWindowRateLimiter(2, 60_000);

    expect(limiter.consume("user-1", 1_000)).toMatchObject({
      allowed: true,
      remaining: 1,
      limit: 2,
    });
    expect(limiter.consume("user-1", 2_000)).toMatchObject({
      allowed: true,
      remaining: 0,
    });
  });

  it("上限を超えると拒否し、再試行までの秒数を返す", () => {
    const limiter = new FixedWindowRateLimiter(1, 60_000);
    limiter.consume("user-1", 1_000);

    expect(limiter.consume("user-1", 2_000)).toEqual({
      allowed: false,
      limit: 1,
      remaining: 0,
      resetAt: 61_000,
      retryAfterSeconds: 59,
    });
  });

  it("時間枠を過ぎると回数をリセットする", () => {
    const limiter = new FixedWindowRateLimiter(1, 60_000);
    limiter.consume("user-1", 1_000);

    expect(limiter.consume("user-1", 61_000)).toMatchObject({
      allowed: true,
      remaining: 0,
      resetAt: 121_000,
    });
  });

  it("キーごとに回数を分離する", () => {
    const limiter = new FixedWindowRateLimiter(1, 60_000);
    limiter.consume("user-1", 1_000);

    expect(limiter.consume("user-2", 2_000).allowed).toBe(true);
  });
});
