import { describe, expect, it, vi } from "vitest";

const { consumePersistentRateLimit } = vi.hoisted(() => ({
  consumePersistentRateLimit: vi.fn(),
}));

vi.mock("@/lib/persistentRateLimit", () => ({ consumePersistentRateLimit }));

import {
  consumeAdminPlaybackIpRateLimit,
  consumeAdminPlaybackRateLimit,
  consumePublicPlaybackIpRateLimit,
} from "@/lib/audioPlaybackRateLimit";
import {
  consumeNotificationReadIpRateLimit,
  consumeNotificationReadUserRateLimit,
  consumeNotificationUpdateIpRateLimit,
  consumeNotificationUpdateUserRateLimit,
} from "@/lib/notificationRateLimit";

const WINDOW_MS = 15 * 60 * 1000;

describe("persistent rate-limit wrappers", () => {
  it.each([
    [consumePublicPlaybackIpRateLimit, "public-ip", "203.0.113.1", 120],
    [consumeAdminPlaybackRateLimit, "admin", "admin-1", 60],
    [consumeAdminPlaybackIpRateLimit, "admin-ip", "203.0.113.2", 120],
    [consumeNotificationUpdateUserRateLimit, "user", "user-1", 30],
    [consumeNotificationUpdateIpRateLimit, "ip", "203.0.113.3", 60],
  ])("passes scope/key/limit/window for %s", (consume, suffix, key, limit) => {
    consumePersistentRateLimit.mockReset();
    consumePersistentRateLimit.mockResolvedValue({ allowed: true });

    const result = consume(key);

    expect(result).toBeInstanceOf(Promise);
    expect(consumePersistentRateLimit).toHaveBeenCalledWith({
      scope: `${suffix === "public-ip" || suffix === "admin" || suffix === "admin-ip" ? "audio-playback" : "notification-update"}:${suffix}`,
      key,
      limit,
      windowMs: WINDOW_MS,
    });
  });

  it("keeps notification read rate limits synchronous FixedWindow results", () => {
    for (const [consume, key, limit] of [
      [consumeNotificationReadUserRateLimit, "read-user-unique", 60],
      [consumeNotificationReadIpRateLimit, "read-ip-unique", 120],
    ] as const) {
      const result = consume(key);

      expect(result).toMatchObject({
        allowed: true,
        limit,
        remaining: limit - 1,
        retryAfterSeconds: expect.any(Number),
        resetAt: expect.any(Number),
      });
      expect(result).not.toHaveProperty("then");
    }
  });
});
