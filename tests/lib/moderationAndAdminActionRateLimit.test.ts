import { beforeEach, describe, expect, it, vi } from "vitest";

const { consumePersistentRateLimit } = vi.hoisted(() => ({
  consumePersistentRateLimit: vi.fn(),
}));

vi.mock("@/lib/persistentRateLimit", () => ({
  consumePersistentRateLimit,
}));

import {
  consumeAdminActionIpRateLimit,
  consumeAdminActionRateLimit,
} from "@/lib/adminActionRateLimit";
import {
  consumeModerationRequestIpRateLimit,
  consumeModerationRequestUserRateLimit,
} from "@/lib/moderationRequestRateLimit";

describe("永続化されたレート制限wrapper", () => {
  beforeEach(() => consumePersistentRateLimit.mockReset());

  it("moderation requestのscope、key、制限値を渡す", () => {
    consumeModerationRequestUserRateLimit("user-1");
    consumeModerationRequestIpRateLimit("192.0.2.1");

    expect(consumePersistentRateLimit).toHaveBeenNthCalledWith(1, {
      scope: "moderation-request:user",
      key: "user-1",
      limit: 5,
      windowMs: 24 * 60 * 60 * 1000,
    });
    expect(consumePersistentRateLimit).toHaveBeenNthCalledWith(2, {
      scope: "moderation-request:ip",
      key: "192.0.2.1",
      limit: 15,
      windowMs: 24 * 60 * 60 * 1000,
    });
  });

  it("admin actionのscope、key、制限値を渡す", () => {
    consumeAdminActionRateLimit("admin-1");
    consumeAdminActionIpRateLimit("192.0.2.2");

    expect(consumePersistentRateLimit).toHaveBeenNthCalledWith(1, {
      scope: "admin-action:admin",
      key: "admin-1",
      limit: 60,
      windowMs: 15 * 60 * 1000,
    });
    expect(consumePersistentRateLimit).toHaveBeenNthCalledWith(2, {
      scope: "admin-action:ip",
      key: "192.0.2.2",
      limit: 120,
      windowMs: 15 * 60 * 1000,
    });
  });
});
