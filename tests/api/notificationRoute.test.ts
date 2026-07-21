import { beforeEach, describe, expect, it, vi } from "vitest";

const { mocks } = vi.hoisted(() => ({
  mocks: {
    authorizeProfileOwnerRequest: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
    transaction: vi.fn(),
    userRateLimit: vi.fn(),
    ipRateLimit: vi.fn(),
    getClientIp: vi.fn(),
  },
}));

vi.mock("@/lib/profileOwnerAuth", () => ({
  authorizeProfileOwnerRequest: mocks.authorizeProfileOwnerRequest,
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    userNotification: { findMany: mocks.findMany, count: mocks.count },
    $transaction: mocks.transaction,
  },
}));
vi.mock("@/lib/notificationRateLimit", () => ({
  consumeNotificationReadUserRateLimit: mocks.userRateLimit,
  consumeNotificationReadIpRateLimit: mocks.ipRateLimit,
}));
vi.mock("@/lib/clientIp", () => ({ getClientIp: mocks.getClientIp }));

import { GET } from "@/app/(site)/api/notifications/route";

const request = () =>
  new Request("http://localhost/api/notifications", {
    headers: { Authorization: "Bearer valid-token" },
  });

describe("GET /api/notifications", () => {
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
    mocks.findMany.mockReturnValue("find-many-query");
    mocks.count.mockReturnValue("count-query");
    mocks.transaction.mockResolvedValue([
      [
        {
          id: "notification-1",
          title: "音声の公開状態について",
          message: "音声を非公開にしました。",
          readAt: null,
          createdAt: new Date("2026-07-21T06:00:00.000Z"),
        },
      ],
      1,
    ]);
  });

  it("本人の最新通知と未読件数だけを返す", async () => {
    const response = await GET(request());
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(result).toEqual({
      notifications: [
        {
          id: "notification-1",
          title: "音声の公開状態について",
          message: "音声を非公開にしました。",
          readAt: null,
          createdAt: "2026-07-21T06:00:00.000Z",
        },
      ],
      unreadCount: 1,
    });
    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { profileId: "profile-1" },
        take: 20,
      }),
    );
    expect(mocks.count).toHaveBeenCalledWith({
      where: { profileId: "profile-1", readAt: null },
    });
  });

  it("未認証の場合はDBへ問い合わせない", async () => {
    mocks.authorizeProfileOwnerRequest.mockResolvedValue({
      ok: false,
      response: Response.json({ error: "認証が必要です。" }, { status: 401 }),
    });

    const response = await GET(request());

    expect(response.status).toBe(401);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
