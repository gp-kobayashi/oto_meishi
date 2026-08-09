import { beforeEach, describe, expect, it, vi } from "vitest";

const { mocks } = vi.hoisted(() => ({
  mocks: {
    authorizeAdminRequest: vi.fn(),
    transaction: vi.fn(),
    profileFindUnique: vi.fn(),
    profileUpdate: vi.fn(),
    socialLinkFindUnique: vi.fn(),
    socialLinkUpdate: vi.fn(),
    actionCreate: vi.fn(),
    notificationCreate: vi.fn(),
    moderationCaseCreate: vi.fn(),
    moderationCaseFindFirst: vi.fn(),
    moderationCaseFindMany: vi.fn(),
    moderationCaseUpdate: vi.fn(),
    moderationSnapshotCreate: vi.fn(),
    moderationCaseEventCreate: vi.fn(),
    moderationViolationEventCreate: vi.fn(),
    moderationViolationEventFindMany: vi.fn(),
    executeRawUnsafe: vi.fn(),
    consumeAdminActionRateLimit: vi.fn(),
    consumeAdminActionIpRateLimit: vi.fn(),
  },
}));

vi.mock("@/lib/adminAuth", () => ({
  authorizeAdminRequest: mocks.authorizeAdminRequest,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: { $transaction: mocks.transaction },
}));

vi.mock("@/lib/adminActionRateLimit", () => ({
  consumeAdminActionRateLimit: mocks.consumeAdminActionRateLimit,
  consumeAdminActionIpRateLimit: mocks.consumeAdminActionIpRateLimit,
}));

import { PATCH } from "@/app/(site)/api/admin/moderation/actions/route";

const tx = {
  $executeRawUnsafe: mocks.executeRawUnsafe,
  profile: { findUnique: mocks.profileFindUnique, update: mocks.profileUpdate },
  socialLink: {
    findUnique: mocks.socialLinkFindUnique,
    update: mocks.socialLinkUpdate,
  },
  moderationAction: { create: mocks.actionCreate },
  moderationCase: {
    create: mocks.moderationCaseCreate,
    findFirst: mocks.moderationCaseFindFirst,
    findMany: mocks.moderationCaseFindMany,
    update: mocks.moderationCaseUpdate,
  },
  moderationSnapshot: { create: mocks.moderationSnapshotCreate },
  moderationCaseEvent: { create: mocks.moderationCaseEventCreate },
  moderationViolationEvent: {
    create: mocks.moderationViolationEventCreate,
    findMany: mocks.moderationViolationEventFindMany,
  },
  userNotification: { create: mocks.notificationCreate },
};

const request = (body: unknown) =>
  new Request("http://localhost/api/admin/moderation/actions", {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: "Bearer token" },
    body: JSON.stringify(body),
  });

describe("PATCH /api/admin/moderation/actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorizeAdminRequest.mockResolvedValue({
      ok: true,
      admin: { id: "admin-1", authId: "auth-1", role: "admin" },
    });
    mocks.transaction.mockImplementation((callback) => callback(tx));
    mocks.profileFindUnique.mockResolvedValue({
      id: "profile-1",
      status: "active",
      accountModerationStatus: "active",
      displayName: "変更前の名前",
      bio: "変更前の自己紹介",
      theme: "normal",
      audioUrl: "",
      audioKey: "audio/testuser/before.m4a",
      audioContentHash: "a".repeat(64),
      audioTitle: "変更前の音声",
      audioStatus: "active",
      sns: [
        {
          id: "link-1",
          service: "youtube",
          url: "https://www.youtube.com/@before",
          label: "変更前のYouTube",
          sortOrder: 0,
          status: "active",
        },
      ],
    });
    mocks.profileUpdate.mockResolvedValue({});
    mocks.actionCreate.mockResolvedValue({ id: "action-1" });
    mocks.notificationCreate.mockResolvedValue({ id: "notification-1" });
    mocks.moderationCaseCreate.mockResolvedValue({ id: "case-1" });
    mocks.moderationCaseFindFirst.mockResolvedValue(null);
    mocks.moderationCaseFindMany.mockResolvedValue([]);
    mocks.moderationCaseUpdate.mockResolvedValue({});
    mocks.moderationViolationEventCreate.mockResolvedValue({
      id: "violation-event-1",
    });
    mocks.moderationViolationEventFindMany.mockResolvedValue([]);
    mocks.executeRawUnsafe.mockResolvedValue(0);
    mocks.consumeAdminActionRateLimit.mockReturnValue({
      allowed: true,
      limit: 60,
      remaining: 59,
      resetAt: Date.now() + 15 * 60 * 1000,
      retryAfterSeconds: 15 * 60,
    });
    mocks.consumeAdminActionIpRateLimit.mockReturnValue({
      allowed: true,
      limit: 120,
      remaining: 119,
      resetAt: Date.now() + 15 * 60 * 1000,
      retryAfterSeconds: 15 * 60,
    });
  });

  it("プロフィールを非公開にして履歴を同じトランザクションで保存する", async () => {
    const response = await PATCH(
      request({
        targetType: "profile",
        targetId: "profile-1",
        action: "hide",
        reason: "不適切な内容のため",
        reasonCode: "harassment",
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(mocks.profileUpdate).toHaveBeenCalledWith({
      where: { id: "profile-1" },
      data: { status: "hidden" },
    });
    expect(mocks.actionCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        adminUserId: "admin-1",
        previousStatus: "active",
        newStatus: "hidden",
        reason: "不適切な内容のため",
      }),
      select: { id: true },
    });
    expect(mocks.notificationCreate).toHaveBeenCalledWith({
      data: {
        profileId: "profile-1",
        moderationActionId: "action-1",
        title: "プロフィールの公開状態について",
        message:
          "規約違反が確認されたため、プロフィールを非公開にしました。",
      },
    });
    expect(mocks.moderationCaseCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        profileId: "profile-1",
        targetType: "profile",
        targetId: "profile-1",
        reasonCode: "harassment",
        reviewMode: "preReview",
        status: "correctionRequired",
        userMessage: "不適切な内容のため",
      }),
      select: { id: true },
    });
    expect(mocks.moderationViolationEventCreate).toHaveBeenCalledWith({
      data: {
        profileId: "profile-1",
        moderationCaseId: "case-1",
        adminUserId: "admin-1",
        adminAuthId: "auth-1",
        adminRole: "admin",
        eventType: "confirmed",
        reasonCode: "harassment",
        suspensionTriggered: false,
        note: "不適切な内容のため",
      },
      select: { id: true },
    });
    expect(mocks.moderationSnapshotCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        moderationCaseId: "case-1",
        kind: "reported",
        content: {
          displayName: "変更前の名前",
          bio: "変更前の自己紹介",
          theme: "normal",
          status: "active",
          audio: {
            hasAudio: true,
            contentHash: "a".repeat(64),
            title: "変更前の音声",
            status: "active",
          },
          socialLinks: [
            {
              id: "link-1",
              service: "youtube",
              url: "https://www.youtube.com/@before",
              label: "変更前のYouTube",
              sortOrder: 0,
              status: "active",
            },
          ],
        },
      }),
    });
    expect(mocks.moderationCaseEventCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        moderationCaseId: "case-1",
        eventType: "created",
        actorType: "admin",
        newStatus: "correctionRequired",
      }),
    });
  });

  it("同種の確定違反が2回目になるとアカウントを利用停止する", async () => {
    mocks.moderationViolationEventFindMany.mockResolvedValue([
      {
        id: "previous-violation",
        eventType: "confirmed",
        reasonCode: "harassment",
        originalViolationEventId: null,
      },
    ]);

    const response = await PATCH(
      request({
        targetType: "profile",
        targetId: "profile-1",
        action: "hide",
        reason: "同種の違反を再度確認しました",
        reasonCode: "harassment",
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.executeRawUnsafe).toHaveBeenCalledWith(
      "select pg_advisory_xact_lock(hashtextextended($1, 0))",
      "profile-1",
    );
    expect(mocks.profileUpdate).toHaveBeenCalledWith({
      where: { id: "profile-1" },
      data: expect.objectContaining({
        status: "suspended",
        accountModerationStatus: "suspended",
        suspensionAppealDueAt: expect.any(Date),
      }),
    });
    expect(mocks.actionCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "suspend",
        previousStatus: "active",
        newStatus: "suspended",
      }),
      select: { id: true },
    });
    expect(mocks.moderationViolationEventCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ suspensionTriggered: true }),
      select: { id: true },
    });
    expect(mocks.notificationCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        title: "プロフィールの利用停止について",
      }),
    });
  });

  it("音声違反で停止基準に達した場合は音声非公開とアカウント停止を両方記録する", async () => {
    mocks.profileFindUnique
      .mockResolvedValueOnce({
        id: "profile-1",
        audioKey: "audio/user/voice.m4a",
        audioContentHash: "audio-hash",
        audioUrl: "",
        audioTitle: "自己紹介音声",
        audioStatus: "active",
        status: "active",
        accountModerationStatus: "active",
      });
    mocks.moderationViolationEventFindMany.mockResolvedValue([
      {
        id: "violation-1",
        eventType: "confirmed",
        reasonCode: "unsafeLink",
        originalViolationEventId: null,
      },
      {
        id: "violation-2",
        eventType: "confirmed",
        reasonCode: "harassment",
        originalViolationEventId: null,
      },
    ]);
    mocks.actionCreate
      .mockResolvedValueOnce({ id: "suspension-action" })
      .mockResolvedValueOnce({ id: "audio-action" });

    const response = await PATCH(
      request({
        targetType: "audio",
        targetId: "profile-1",
        action: "hide",
        reason: "不適切な音声を確認しました",
        reasonCode: "inappropriateContent",
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.profileUpdate).toHaveBeenNthCalledWith(1, {
      where: { id: "profile-1" },
      data: { audioStatus: "hidden" },
    });
    expect(mocks.profileUpdate).toHaveBeenNthCalledWith(2, {
      where: { id: "profile-1" },
      data: expect.objectContaining({
        status: "suspended",
        accountModerationStatus: "suspended",
      }),
    });
    expect(mocks.actionCreate).toHaveBeenNthCalledWith(1, {
      data: expect.objectContaining({
        targetType: "profile",
        action: "suspend",
        previousStatus: "active",
        newStatus: "suspended",
      }),
      select: { id: true },
    });
    expect(mocks.actionCreate).toHaveBeenNthCalledWith(2, {
      data: expect.objectContaining({
        targetType: "audio",
        action: "hide",
        previousStatus: "active",
        newStatus: "hidden",
      }),
      select: { id: true },
    });
    expect(mocks.notificationCreate).toHaveBeenCalledTimes(2);
    expect(mocks.moderationViolationEventCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ suspensionTriggered: true }),
      select: { id: true },
    });
  });

  it("違反分類がない既存リクエストは安全側の事前確認として保存する", async () => {
    const response = await PATCH(
      request({
        targetType: "profile",
        targetId: "profile-1",
        action: "hide",
        reason: "分類されていない違反",
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.moderationCaseCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        reasonCode: "other",
        reviewMode: "preReview",
      }),
      select: { id: true },
    });
  });

  it("リンクを非公開にすると正規化URLのハッシュを保存する", async () => {
    mocks.socialLinkFindUnique.mockResolvedValueOnce({
      id: "link-1",
      profileId: "profile-1",
      service: "youtube",
      label: "YouTube",
      url: "https://YOUTUBE.com/@blocked/#profile",
      status: "active",
    });

    const response = await PATCH(
      request({
        targetType: "socialLink",
        targetId: "link-1",
        action: "hide",
        reason: "危険なリンクのため",
        reasonCode: "unsafeLink",
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.moderationSnapshotCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        moderationCaseId: "case-1",
        kind: "reported",
        contentHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    });
  });

  it("音声を非公開にすると現在の音声ハッシュを保存する", async () => {
    const audioContentHash = "c".repeat(64);
    mocks.profileFindUnique.mockResolvedValueOnce({
      id: "profile-1",
      audioKey: "audio/testuser/current.m4a",
      audioContentHash,
      audioUrl: "",
      audioTitle: "自己紹介音声",
      audioStatus: "active",
    });

    const response = await PATCH(
      request({
        targetType: "audio",
        targetId: "profile-1",
        action: "hide",
        reason: "不適切な音声のため",
        reasonCode: "inappropriateContent",
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.moderationSnapshotCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        moderationCaseId: "case-1",
        kind: "reported",
        contentHash: audioContentHash,
        storageObjectKey: "audio/testuser/current.m4a",
      }),
    });
  });

  it("未完了のプロフィール審査ケースがある場合は直接復旧を拒否する", async () => {
    mocks.profileFindUnique.mockResolvedValue({
      id: "profile-1",
      status: "hidden",
      accountModerationStatus: "active",
      displayName: "修正後の名前",
      bio: "修正後の自己紹介",
      theme: "normal",
    });
    mocks.moderationCaseFindFirst.mockResolvedValue({ id: "case-1" });

    const response = await PATCH(
      request({
        targetType: "profile",
        targetId: "profile-1",
        action: "restore",
        reason: "修正内容を確認したため再公開",
      }),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error:
        "未完了の審査ケースがあるため、ケースの審査操作から再公開してください。",
    });
    expect(mocks.moderationCaseFindFirst).toHaveBeenCalledWith({
      where: {
        profileId: "profile-1",
        targetType: "profile",
        targetId: "profile-1",
        status: {
          in: [
            "correctionRequired",
            "postReviewPending",
            "preReviewPending",
          ],
        },
      },
      select: { id: true },
    });
    expect(mocks.profileUpdate).not.toHaveBeenCalled();
    expect(mocks.actionCreate).not.toHaveBeenCalled();
    expect(mocks.moderationCaseUpdate).not.toHaveBeenCalled();
    expect(mocks.moderationCaseEventCreate).not.toHaveBeenCalled();
    expect(mocks.notificationCreate).not.toHaveBeenCalled();
    expect(mocks.moderationCaseCreate).not.toHaveBeenCalled();
    expect(mocks.moderationViolationEventCreate).not.toHaveBeenCalled();
  });

  it("完全削除処理が開始されたプロフィールは直接復旧できない", async () => {
    mocks.profileFindUnique.mockResolvedValue({
      id: "profile-1",
      status: "hidden",
      accountModerationStatus: "deletionPending",
      deletionProcessingStartedAt: new Date("2026-08-08T01:00:00.000Z"),
      displayName: "削除対象",
      bio: "",
      theme: "normal",
    });

    const response = await PATCH(
      request({
        targetType: "profile",
        targetId: "profile-1",
        action: "restore",
        reason: "再公開します",
      }),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "アカウントの削除処理が開始されているため、再公開できません。",
    });
    expect(mocks.moderationCaseFindFirst).not.toHaveBeenCalled();
    expect(mocks.profileUpdate).not.toHaveBeenCalled();
    expect(mocks.actionCreate).not.toHaveBeenCalled();
  });

  it("未完了の音声審査ケースがある場合は直接復旧を拒否する", async () => {
    mocks.profileFindUnique.mockResolvedValue({
      id: "profile-1",
      audioKey: "audio/user/voice.m4a",
      audioContentHash: "audio-hash",
      audioUrl: "",
      audioTitle: "自己紹介音声",
      audioStatus: "hidden",
    });
    mocks.moderationCaseFindFirst.mockResolvedValue({ id: "case-audio" });

    const response = await PATCH(
      request({
        targetType: "audio",
        targetId: "profile-1",
        action: "restore",
        reason: "再公開します",
      }),
    );

    expect(response.status).toBe(409);
    expect(mocks.moderationCaseFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          targetType: "audio",
          targetId: "profile-1",
        }),
      }),
    );
    expect(mocks.profileUpdate).not.toHaveBeenCalled();
    expect(mocks.actionCreate).not.toHaveBeenCalled();
    expect(mocks.notificationCreate).not.toHaveBeenCalled();
  });

  it("未完了のリンク審査ケースがある場合は直接復旧を拒否する", async () => {
    mocks.socialLinkFindUnique.mockResolvedValue({
      id: "link-1",
      profileId: "profile-1",
      service: "youtube",
      label: "YouTube",
      url: "https://youtube.com/example",
      status: "hidden",
    });
    mocks.moderationCaseFindFirst.mockResolvedValue({ id: "case-link" });

    const response = await PATCH(
      request({
        targetType: "socialLink",
        targetId: "link-1",
        action: "restore",
        reason: "再公開します",
      }),
    );

    expect(response.status).toBe(409);
    expect(mocks.moderationCaseFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          profileId: "profile-1",
          targetType: "socialLink",
          targetId: "link-1",
        }),
      }),
    );
    expect(mocks.socialLinkUpdate).not.toHaveBeenCalled();
    expect(mocks.actionCreate).not.toHaveBeenCalled();
    expect(mocks.notificationCreate).not.toHaveBeenCalled();
  });

  it("理由が空の場合は400を返す", async () => {
    const response = await PATCH(
      request({ targetType: "audio", targetId: "profile-1", action: "hide", reason: " " }),
    );

    expect(response.status).toBe(400);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("プロフィール利用停止時に60日間の解除申請期限を設定する", async () => {
    const before = Date.now();
    const response = await PATCH(
      request({
        targetType: "profile",
        targetId: "profile-1",
        action: "suspend",
        reason: "繰り返しの規約違反",
      }),
    );

    expect(response.status).toBe(200);
    const update = mocks.profileUpdate.mock.calls[0][0];
    expect(update.where).toEqual({ id: "profile-1" });
    expect(update.data).toEqual(
      expect.objectContaining({
        status: "suspended",
        accountModerationStatus: "suspended",
      }),
    );
    expect(update.data.suspensionAppealDueAt.getTime()).toBeGreaterThanOrEqual(
      before + 59 * 24 * 60 * 60 * 1000,
    );
    expect(mocks.moderationCaseCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        profileId: "profile-1",
        targetType: "profile",
        targetId: "profile-1",
        reasonCode: "other",
        status: "correctionRequired",
      }),
      select: { id: true },
    });
    expect(mocks.moderationViolationEventCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        moderationCaseId: "case-1",
        eventType: "confirmed",
        reasonCode: "other",
        suspensionTriggered: true,
      }),
      select: { id: true },
    });
  });

  it("管理操作JSONが16KBを超える場合は413を返す", async () => {
    const response = await PATCH(
      request({
        targetType: "profile",
        targetId: "profile-1",
        action: "hide",
        reason: "a".repeat(16 * 1024),
      }),
    );

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({
      error: "管理操作データは16KB以下にしてください。",
    });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("管理者の操作回数が上限に達した場合は本文解析前に429を返す", async () => {
    mocks.consumeAdminActionRateLimit.mockReturnValueOnce({
      allowed: false,
      limit: 60,
      remaining: 0,
      resetAt: 901_000,
      retryAfterSeconds: 120,
    });
    const moderationRequest = request({
      targetType: "profile",
      targetId: "profile-1",
      action: "hide",
      reason: "不適切な内容のため",
    });

    const response = await PATCH(moderationRequest);

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("120");
    expect(response.headers.get("X-RateLimit-Limit")).toBe("60");
    expect(response.headers.get("X-RateLimit-Remaining")).toBe("0");
    await expect(response.json()).resolves.toEqual({
      error:
        "管理操作の回数が上限に達しました。しばらく待ってから再度お試しください。",
    });
    expect(mocks.consumeAdminActionRateLimit).toHaveBeenCalledWith("admin-1");
    expect(moderationRequest.bodyUsed).toBe(false);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("接続元IPの操作回数が上限に達した場合は本文解析前に429を返す", async () => {
    mocks.consumeAdminActionIpRateLimit.mockReturnValueOnce({
      allowed: false,
      limit: 120,
      remaining: 0,
      resetAt: 901_000,
      retryAfterSeconds: 90,
    });
    const moderationRequest = new Request(
      "http://localhost/api/admin/moderation/actions",
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer token",
          "CF-Connecting-IP": "203.0.113.10",
        },
        body: JSON.stringify({
          targetType: "profile",
          targetId: "profile-1",
          action: "hide",
          reason: "不適切な内容のため",
        }),
      },
    );

    const response = await PATCH(moderationRequest);

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("90");
    expect(response.headers.get("X-RateLimit-Limit")).toBe("120");
    await expect(response.json()).resolves.toEqual({
      error:
        "この接続元からの管理操作が集中しています。しばらく待ってから再度お試しください。",
    });
    expect(mocks.consumeAdminActionIpRateLimit).toHaveBeenCalledWith(
      "203.0.113.10",
    );
    expect(moderationRequest.bodyUsed).toBe(false);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("接続元IPを取得できない場合はIP制限をスキップする", async () => {
    const response = await PATCH(
      request({
        targetType: "profile",
        targetId: "profile-1",
        action: "hide",
        reason: "不適切な内容のため",
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.consumeAdminActionIpRateLimit).not.toHaveBeenCalled();
  });

  it("JSON以外のContent-Typeは認可後かつ本文解析前に415を返す", async () => {
    const moderationRequest = new Request(
      "http://localhost/api/admin/moderation/actions",
      {
        method: "PATCH",
        headers: {
          "Content-Type": "text/plain",
          Authorization: "Bearer token",
        },
        body: JSON.stringify({
          targetType: "profile",
          targetId: "profile-1",
          action: "hide",
          reason: "不適切な内容のため",
        }),
      },
    );

    const response = await PATCH(moderationRequest);

    expect(response.status).toBe(415);
    await expect(response.json()).resolves.toEqual({
      error: "Content-Typeはapplication/jsonを指定してください。",
    });
    expect(mocks.authorizeAdminRequest).toHaveBeenCalledWith(moderationRequest);
    expect(moderationRequest.bodyUsed).toBe(false);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("不正なJSONの場合は400を返す", async () => {
    const response = await PATCH(
      new Request("http://localhost/api/admin/moderation/actions", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer token",
        },
        body: "{invalid",
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "JSONの形式が不正です。",
    });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("同じ状態への変更は409で履歴を作らない", async () => {
    mocks.profileFindUnique.mockResolvedValue({
      id: "profile-1",
      status: "hidden",
      accountModerationStatus: "active",
    });

    const response = await PATCH(
      request({ targetType: "profile", targetId: "profile-1", action: "hide", reason: "確認" }),
    );

    expect(response.status).toBe(409);
    expect(mocks.actionCreate).not.toHaveBeenCalled();
    expect(mocks.notificationCreate).not.toHaveBeenCalled();
  });
});
