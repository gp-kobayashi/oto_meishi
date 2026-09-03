import { beforeEach, describe, expect, it, vi } from "vitest";

const { mocks } = vi.hoisted(() => ({
  mocks: {
    authorizeProfileOwnerRequest: vi.fn(),
    findMany: vi.fn(),
    socialLinkFindMany: vi.fn(),
    moderationCaseFindMany: vi.fn(),
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
    socialLink: { findMany: mocks.socialLinkFindMany },
    moderationCase: { findMany: mocks.moderationCaseFindMany },
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
    mocks.socialLinkFindMany.mockResolvedValue([]);
    mocks.moderationCaseFindMany.mockResolvedValue([
      {
        targetType: "audio",
        targetId: "profile-1",
        reviewMode: "postReview",
      },
    ]);
    mocks.transaction.mockResolvedValue([
      [
        {
          id: "notification-1",
          title: "音声の公開状態について",
          message: "音声を非公開にしました。",
          readAt: null,
          createdAt: new Date("2026-07-21T06:00:00.000Z"),
          profile: {
            displayName: "テストユーザー",
            audioTitle: "自己紹介音声",
          },
          moderationAction: {
            targetType: "audio",
            targetId: "profile-1",
            action: "hide",
            reason: "不適切な表現が含まれています。",
            createdAt: new Date("2026-07-21T05:55:00.000Z"),
          },
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
          targetType: "audio",
          targetLabel: "自己紹介音声",
          actionLabel: "非公開",
          reason: "不適切な表現が含まれています。",
          guidance:
            "音声を修正しても、管理者の確認が完了するまで公開されません。",
          actionUrl: "/profile/edit",
          actionLinkLabel: "音声を修正",
          handledAt: "2026-07-21T05:55:00.000Z",
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
    expect(mocks.moderationCaseFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ profileId: "profile-1" }),
      }),
    );
    expect(JSON.stringify(result)).not.toContain("adminUserId");
    expect(JSON.stringify(result)).not.toContain("reviewNote");
  });

  it("削除済みリンクは代替名で表示し、所有プロフィール内だけを検索する", async () => {
    mocks.transaction.mockResolvedValueOnce([
      [
        {
          id: "notification-link",
          title: "リンクの公開状態について",
          message: "リンクを非公開にしました。",
          readAt: null,
          createdAt: new Date("2026-07-21T06:00:00.000Z"),
          profile: { displayName: "テスト", audioTitle: "" },
          moderationAction: {
            targetType: "socialLink",
            targetId: "deleted-link",
            action: "hide",
            reason: "選択されたサービスと異なるURLです。",
            createdAt: new Date("2026-07-21T05:55:00.000Z"),
          },
        },
      ],
      1,
    ]);
    mocks.moderationCaseFindMany.mockResolvedValueOnce([
      {
        targetType: "socialLink",
        targetId: "deleted-link",
        reviewMode: "preReview",
      },
    ]);

    const response = await GET(request());
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result.notifications[0]).toEqual(
      expect.objectContaining({
        targetType: "socialLink",
        targetLabel: "対象のリンク",
        guidance:
          "リンクを修正しても、管理者の確認が完了するまで公開されません。",
      }),
    );
    expect(mocks.socialLinkFindMany).toHaveBeenCalledWith({
      where: {
        profileId: "profile-1",
        id: { in: ["deleted-link"] },
      },
      select: { id: true, label: true },
    });
  });

  it("respond通知は回答内容と問い合わせ導線を返す", async () => {
    mocks.transaction.mockResolvedValueOnce([
      [
        {
          id: "notification-response",
          title: "お問い合わせへの回答",
          message: "ご質問への回答です。",
          readAt: null,
          createdAt: new Date("2026-07-21T06:00:00.000Z"),
          profile: { displayName: "テスト", audioTitle: "" },
          moderationAction: {
            targetType: "profile",
            targetId: "profile-1",
            action: "respond",
            reason: "ご質問への回答です。",
            createdAt: new Date("2026-07-21T05:55:00.000Z"),
          },
        },
      ],
      1,
    ]);

    const response = await GET(request());
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result.notifications[0]).toEqual(
      expect.objectContaining({
        actionLabel: "回答",
        message: "ご質問への回答です。",
        reason: "ご質問への回答です。",
        actionUrl: "/support",
        actionLinkLabel: "回答を確認",
      }),
    );
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
