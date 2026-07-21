import { beforeEach, describe, expect, it, vi } from "vitest";

const { mocks } = vi.hoisted(() => ({
  mocks: {
    authorizeProfileOwnerRequest: vi.fn(),
    updateMany: vi.fn(),
    userRateLimit: vi.fn(),
    ipRateLimit: vi.fn(),
    getClientIp: vi.fn(),
  },
}));

vi.mock("@/lib/profileOwnerAuth", () => ({
  authorizeProfileOwnerRequest: mocks.authorizeProfileOwnerRequest,
}));
vi.mock("@/lib/prisma", () => ({
  prisma: { userNotification: { updateMany: mocks.updateMany } },
}));
vi.mock("@/lib/notificationRateLimit", () => ({
  consumeNotificationUpdateUserRateLimit: mocks.userRateLimit,
  consumeNotificationUpdateIpRateLimit: mocks.ipRateLimit,
}));
vi.mock("@/lib/clientIp", () => ({ getClientIp: mocks.getClientIp }));

import { PATCH } from "@/app/(site)/api/notifications/read/route";

const request = () =>
  new Request("http://localhost/api/notifications/read", {
    method: "PATCH",
    headers: { Authorization: "Bearer valid-token" },
  });

describe("PATCH /api/notifications/read", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorizeProfileOwnerRequest.mockResolvedValue({
      ok: true,
      userId: "auth-user-1",
      profileId: "profile-1",
    });
    mocks.userRateLimit.mockReturnValue({ allowed: true });
    mocks.ipRateLimit.mockReturnValue({ allowed: true });
    mocks.getClientIp.mockReturnValue(null);
    mocks.updateMany.mockResolvedValue({ count: 2 });
  });

  it("本人の未読通知だけをまとめて既読にする", async () => {
    const response = await PATCH(request());

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual({
      success: true,
      updatedCount: 2,
    });
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { profileId: "profile-1", readAt: null },
      data: { readAt: expect.any(Date) },
    });
  });

  it("未認証の場合は通知を更新しない", async () => {
    mocks.authorizeProfileOwnerRequest.mockResolvedValue({
      ok: false,
      response: Response.json({ error: "認証が必要です。" }, { status: 401 }),
    });

    const response = await PATCH(request());

    expect(response.status).toBe(401);
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it("更新回数が上限に達した場合は429を返す", async () => {
    mocks.userRateLimit.mockReturnValue({
      allowed: false,
      retryAfterSeconds: 60,
    });

    const response = await PATCH(request());

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("60");
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });
});
