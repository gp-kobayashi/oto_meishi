import { beforeEach, describe, expect, it, vi } from "vitest";

const { mocks } = vi.hoisted(() => ({
  mocks: {
    authorize: vi.fn(),
    adminRateLimit: vi.fn(),
    ipRateLimit: vi.fn(),
    getClientIp: vi.fn(),
    transaction: vi.fn(),
    executeRaw: vi.fn(),
    requestFindUnique: vi.fn(),
    requestUpdate: vi.fn(),
    requestUpdateMany: vi.fn(),
    requestFindFirst: vi.fn(),
    appealUpdateMany: vi.fn(),
    caseCount: vi.fn(),
    caseFindMany: vi.fn(),
    caseUpdate: vi.fn(),
    caseUpdateMany: vi.fn(),
    caseEventCreate: vi.fn(),
    profileUpdate: vi.fn(),
    socialLinkFindFirst: vi.fn(),
    socialLinkUpdate: vi.fn(),
    violationFindFirst: vi.fn(),
    violationFindMany: vi.fn(),
    violationCreate: vi.fn(),
    actionCreate: vi.fn(),
    notificationCreate: vi.fn(),
  },
}));

vi.mock("@/lib/adminAuth", () => ({
  authorizeAdminRequest: mocks.authorize,
}));
vi.mock("@/lib/adminActionRateLimit", () => ({
  consumeAdminActionRateLimit: mocks.adminRateLimit,
  consumeAdminActionIpRateLimit: mocks.ipRateLimit,
}));
vi.mock("@/lib/clientIp", () => ({ getClientIp: mocks.getClientIp }));
vi.mock("@/lib/prisma", () => ({
  prisma: { $transaction: mocks.transaction },
}));

import { PATCH } from "@/app/(site)/api/admin/moderation/identity-verification/[requestId]/route";

const requestId = "verification-1";
const moderationCase = {
  id: "case-1",
  profileId: "profile-1",
  targetType: "profile" as const,
  targetId: "profile-1",
  reasonCode: "impersonation" as const,
  status: "correctionRequired" as const,
  profile: {
    status: "hidden" as const,
    audioStatus: "active" as const,
    accountModerationStatus: "suspended" as const,
    suspensionAppealDueAt: new Date("2999-01-01T00:00:00.000Z"),
    deletionProcessingStartedAt: null,
  },
};

const reviewRequest = (decision: "verified" | "rejected", note: string) =>
  new Request(`http://localhost/api/admin/identity-verification/${requestId}`, {
    method: "PATCH",
    headers: {
      Authorization: "Bearer admin-token",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ decision, note }),
  });

describe("管理者の本人確認審査API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorize.mockResolvedValue({
      ok: true,
      admin: {
        id: "admin-1",
        authId: "auth-admin-1",
        role: "admin",
      },
    });
    mocks.adminRateLimit.mockReturnValue({
      allowed: true,
      retryAfterSeconds: 60,
    });
    mocks.ipRateLimit.mockReturnValue({
      allowed: true,
      retryAfterSeconds: 60,
    });
    mocks.getClientIp.mockReturnValue(null);
    mocks.executeRaw.mockResolvedValue(1);
    mocks.requestFindUnique.mockResolvedValue({
      id: requestId,
      status: "pending",
      profileId: "profile-1",
      postingDeadlineAt: new Date("2999-01-01T00:00:00.000Z"),
      moderationCase,
    });
    mocks.requestUpdate.mockResolvedValue({ id: requestId });
    mocks.requestUpdateMany.mockResolvedValue({ count: 1 });
    mocks.requestFindFirst.mockResolvedValue(null);
    mocks.appealUpdateMany.mockResolvedValue({ count: 1 });
    mocks.caseCount.mockResolvedValue(0);
    mocks.caseFindMany.mockResolvedValue([]);
    mocks.caseUpdate.mockResolvedValue({ id: "case-1" });
    mocks.caseUpdateMany.mockResolvedValue({ count: 0 });
    mocks.caseEventCreate.mockResolvedValue({ id: "event-1" });
    mocks.profileUpdate.mockResolvedValue({ id: "profile-1" });
    mocks.violationFindFirst.mockResolvedValue({
      id: "violation-1",
      reasonCode: "impersonation",
      suspensionTriggered: true,
    });
    mocks.violationFindMany.mockResolvedValue([
      {
        id: "violation-1",
        eventType: "confirmed",
        reasonCode: "impersonation",
        originalViolationEventId: null,
      },
      {
        id: "revocation-1",
        eventType: "revoked",
        reasonCode: "impersonation",
        originalViolationEventId: "violation-1",
      },
    ]);
    mocks.violationCreate.mockResolvedValue({ id: "revocation-1" });
    mocks.actionCreate.mockResolvedValue({ id: "action-1" });
    mocks.notificationCreate.mockResolvedValue({ id: "notification-1" });
    mocks.transaction.mockImplementation(
      async (callback: (tx: unknown) => unknown) =>
        callback({
          $executeRawUnsafe: mocks.executeRaw,
          $executeRaw: mocks.executeRaw,
          identityVerificationRequest: {
            findUnique: mocks.requestFindUnique,
            update: mocks.requestUpdate,
            updateMany: mocks.requestUpdateMany,
            findFirst: mocks.requestFindFirst,
          },
          moderationRequest: { updateMany: mocks.appealUpdateMany },
          moderationCase: {
            count: mocks.caseCount,
            findMany: mocks.caseFindMany,
            update: mocks.caseUpdate,
            updateMany: mocks.caseUpdateMany,
          },
          moderationCaseEvent: { create: mocks.caseEventCreate },
          profile: { update: mocks.profileUpdate },
          socialLink: {
            findFirst: mocks.socialLinkFindFirst,
            update: mocks.socialLinkUpdate,
          },
          moderationViolationEvent: {
            findFirst: mocks.violationFindFirst,
            findMany: mocks.violationFindMany,
            create: mocks.violationCreate,
          },
          moderationAction: { create: mocks.actionCreate },
          userNotification: { create: mocks.notificationCreate },
        }),
    );
  });

  it("本人確認成功時にケースを完了し停止状態を訂正する", async () => {
    const response = await PATCH(
      reviewRequest("verified", "本人の投稿を確認しました。"),
      {
        params: Promise.resolve({ requestId }),
      },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: "verified",
      caseStatus: "confirmed",
      restored: true,
      revocationId: "revocation-1",
      accountCorrection: { corrected: true, reason: "corrected" },
    });
    expect(mocks.requestUpdate).toHaveBeenCalledWith({
      where: { id: requestId },
      data: expect.objectContaining({
        status: "verified",
        reviewedByAdminUserId: "admin-1",
        reviewNote: "本人の投稿を確認しました。",
      }),
    });
    expect(mocks.requestFindUnique).toHaveBeenCalledTimes(2);
    expect(mocks.profileUpdate).toHaveBeenCalledWith({
      where: { id: "profile-1" },
      data: {
        accountModerationStatus: "active",
        suspensionAppealDueAt: null,
      },
    });
    expect(mocks.profileUpdate).toHaveBeenCalledWith({
      where: { id: "profile-1" },
      data: { status: "active" },
    });
    expect(mocks.violationCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventType: "revoked",
          originalViolationEventId: "violation-1",
        }),
      }),
    );
    expect(mocks.notificationCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ title: "利用停止状態を訂正しました" }),
    });
    expect(mocks.actionCreate).toHaveBeenCalledTimes(2);
    expect(mocks.notificationCreate).toHaveBeenCalledTimes(2);
    expect(mocks.appealUpdateMany).toHaveBeenCalledWith({
      where: {
        profileId: "profile-1",
        kind: "accountAppeal",
        status: "pending",
      },
      data: {
        status: "resolved",
        responseMessage:
          "本人確認により利用停止理由が解消されたため、利用停止状態を訂正しました。",
        resolvedAt: expect.any(Date),
      },
    });
    expect(mocks.executeRaw.mock.calls.slice(0, 2)).toEqual([
      [
        ["select pg_advisory_xact_lock(hashtextextended(", ", 0))"],
        "profile:profile-1",
      ],
      [
        "select pg_advisory_xact_lock(hashtextextended($1, 0))",
        `identity-verification-request:${requestId}`,
      ],
    ]);
    expect(mocks.notificationCreate.mock.calls[1][0]).toEqual({
      data: expect.objectContaining({ title: "本人確認により公開しました" }),
    });
    expect(mocks.actionCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        targetType: "profile",
        targetId: "profile-1",
        action: "restore",
        previousStatus: "suspended",
        newStatus: "active",
      }),
      select: { id: true },
    });
  });

  it("別の未完了ケースがあっても停止状態の訂正は行う", async () => {
    mocks.caseCount.mockResolvedValueOnce(1);

    const response = await PATCH(
      reviewRequest("verified", "本人の投稿を確認しました。"),
      {
        params: Promise.resolve({ requestId }),
      },
    );

    await expect(response.json()).resolves.toMatchObject({
      status: "verified",
      restored: false,
      accountCorrection: { corrected: true },
    });
    expect(mocks.profileUpdate).toHaveBeenCalled();
    expect(mocks.caseCount).toHaveBeenCalledWith({
      where: {
        id: { not: "case-1" },
        profileId: "profile-1",
        status: {
          in: ["correctionRequired", "postReviewPending", "preReviewPending"],
        },
        targetType: "profile",
      },
    });
  });

  it("同じプロフィールのソーシャルリンクだけを公開する", async () => {
    mocks.requestFindUnique.mockResolvedValue({
      id: requestId,
      status: "pending",
      profileId: "profile-1",
      postingDeadlineAt: new Date("2999-01-01T00:00:00.000Z"),
      moderationCase: {
        ...moderationCase,
        targetType: "socialLink",
        targetId: "link-1",
        profile: { ...moderationCase.profile, status: "suspended" },
      },
    });
    mocks.socialLinkFindFirst.mockResolvedValueOnce({ status: "hidden" });

    const response = await PATCH(
      reviewRequest("verified", "本人の投稿を確認しました。"),
      { params: Promise.resolve({ requestId }) },
    );

    await expect(response.json()).resolves.toMatchObject({
      restored: true,
      profileSurfaceRestoration: { restored: true },
    });
    expect(mocks.socialLinkFindFirst).toHaveBeenCalledWith({
      where: { id: "link-1", profileId: "profile-1" },
      select: { status: true },
    });
    expect(mocks.caseCount).toHaveBeenCalledWith({
      where: {
        id: { not: "case-1" },
        profileId: "profile-1",
        status: {
          in: ["correctionRequired", "postReviewPending", "preReviewPending"],
        },
        targetType: "socialLink",
        targetId: "link-1",
      },
    });
    expect(mocks.socialLinkUpdate).toHaveBeenCalledWith({
      where: { id: "link-1" },
      data: { status: "active" },
    });
    expect(mocks.profileUpdate).toHaveBeenCalledWith({
      where: { id: "profile-1" },
      data: { status: "active" },
    });
    expect(mocks.actionCreate).toHaveBeenCalledTimes(3);
    expect(mocks.notificationCreate).toHaveBeenCalledTimes(3);
  });

  it("対象リンクが存在しない場合はリンクを公開しない", async () => {
    mocks.requestFindUnique.mockResolvedValue({
      id: requestId,
      status: "pending",
      profileId: "profile-1",
      postingDeadlineAt: new Date("2999-01-01T00:00:00.000Z"),
      moderationCase: {
        ...moderationCase,
        targetType: "socialLink",
        targetId: "deleted-link",
      },
    });
    mocks.socialLinkFindFirst.mockResolvedValueOnce(null);

    const response = await PATCH(
      reviewRequest("verified", "本人の投稿を確認しました。"),
      { params: Promise.resolve({ requestId }) },
    );

    await expect(response.json()).resolves.toMatchObject({ restored: false });
    expect(mocks.socialLinkUpdate).not.toHaveBeenCalled();
    expect(mocks.actionCreate).toHaveBeenCalledTimes(1);
    expect(mocks.notificationCreate).toHaveBeenCalledTimes(1);
  });

  it("削除済み音声は公開しない", async () => {
    mocks.requestFindUnique.mockResolvedValue({
      id: requestId,
      status: "pending",
      profileId: "profile-1",
      postingDeadlineAt: new Date("2999-01-01T00:00:00.000Z"),
      moderationCase: {
        ...moderationCase,
        targetType: "audio",
        targetId: "profile-1",
        profile: { ...moderationCase.profile, audioStatus: "removed" },
      },
    });

    const response = await PATCH(
      reviewRequest("verified", "本人の投稿を確認しました。"),
      { params: Promise.resolve({ requestId }) },
    );

    await expect(response.json()).resolves.toMatchObject({ restored: false });
    expect(mocks.profileUpdate).toHaveBeenCalledTimes(1);
    expect(mocks.profileUpdate).toHaveBeenCalledWith({
      where: { id: "profile-1" },
      data: { accountModerationStatus: "active", suspensionAppealDueAt: null },
    });
    expect(mocks.actionCreate).toHaveBeenCalledTimes(1);
  });

  it("確認できない場合はケースを修正待ちにして理由を通知する", async () => {
    const response = await PATCH(
      reviewRequest("rejected", "申請内容と投稿が一致しません。"),
      {
        params: Promise.resolve({ requestId }),
      },
    );

    expect(response.status).toBe(200);
    expect(mocks.caseUpdate).toHaveBeenCalledWith({
      where: { id: "case-1" },
      data: {
        status: "correctionRequired",
        resolvedAt: null,
        userMessage: "申請内容と投稿が一致しません。",
      },
    });
    expect(mocks.violationCreate).not.toHaveBeenCalled();
    expect(mocks.notificationCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        title: "本人確認を完了できませんでした",
      }),
    });
  });

  it("別の有効な違反が停止条件を満たす場合は停止状態を維持する", async () => {
    mocks.violationFindMany.mockResolvedValue([
      {
        id: "violation-1",
        eventType: "confirmed",
        reasonCode: "impersonation",
        originalViolationEventId: null,
      },
      {
        id: "revocation-1",
        eventType: "revoked",
        reasonCode: "impersonation",
        originalViolationEventId: "violation-1",
      },
      {
        id: "violation-2",
        eventType: "confirmed",
        reasonCode: "unsafeLink",
        originalViolationEventId: null,
      },
      {
        id: "violation-3",
        eventType: "confirmed",
        reasonCode: "unsafeLink",
        originalViolationEventId: null,
      },
    ]);

    const response = await PATCH(
      reviewRequest("verified", "本人の投稿を確認しました。"),
      { params: Promise.resolve({ requestId }) },
    );

    await expect(response.json()).resolves.toMatchObject({
      restored: false,
      accountCorrection: { corrected: false, reason: "otherActiveViolations" },
    });
    expect(mocks.profileUpdate).not.toHaveBeenCalled();
    expect(mocks.actionCreate).not.toHaveBeenCalled();
    expect(mocks.notificationCreate).not.toHaveBeenCalled();
    expect(mocks.appealUpdateMany).not.toHaveBeenCalled();
  });

  it("別のプロフィール案件が未完了ならプロフィールを公開しない", async () => {
    mocks.caseCount.mockResolvedValueOnce(0).mockResolvedValueOnce(1);
    mocks.requestFindUnique.mockResolvedValue({
      id: requestId,
      status: "pending",
      profileId: "profile-1",
      postingDeadlineAt: new Date("2999-01-01T00:00:00.000Z"),
      moderationCase: {
        ...moderationCase,
        targetType: "socialLink",
        targetId: "link-1",
        profile: { ...moderationCase.profile, status: "suspended" },
      },
    });
    mocks.socialLinkFindFirst.mockResolvedValueOnce({ status: "hidden" });

    const response = await PATCH(
      reviewRequest("verified", "リンク本人を確認しました。"),
      { params: Promise.resolve({ requestId }) },
    );

    await expect(response.json()).resolves.toMatchObject({
      restored: true,
      profileSurfaceRestoration: { restored: false },
    });
    expect(mocks.socialLinkUpdate).toHaveBeenCalled();
    expect(mocks.profileUpdate).not.toHaveBeenCalledWith({
      where: { id: "profile-1" },
      data: { status: "active" },
    });
  });

  it("削除処理中のアカウントは停止状態を訂正しない", async () => {
    const profile = {
      ...moderationCase.profile,
      deletionProcessingStartedAt: new Date("2025-01-01T00:00:00.000Z"),
    };
    mocks.requestFindUnique.mockResolvedValue({
      id: requestId,
      status: "pending",
      profileId: "profile-1",
      postingDeadlineAt: new Date("2999-01-01T00:00:00.000Z"),
      moderationCase: {
        ...moderationCase,
        profile: {
          ...profile,
        },
      },
    });

    const response = await PATCH(
      reviewRequest("verified", "本人の投稿を確認しました。"),
      { params: Promise.resolve({ requestId }) },
    );

    await expect(response.json()).resolves.toMatchObject({
      restored: false,
      accountCorrection: { corrected: false, reason: "deletionPending" },
    });
    expect(mocks.profileUpdate).not.toHaveBeenCalled();
  });

  it("削除保留中のアカウントは停止状態を訂正しない", async () => {
    const profile = {
      ...moderationCase.profile,
      accountModerationStatus: "deletionPending" as const,
    };
    mocks.requestFindUnique.mockResolvedValue({
      id: requestId,
      status: "pending",
      profileId: "profile-1",
      postingDeadlineAt: new Date("2999-01-01T00:00:00.000Z"),
      moderationCase: {
        ...moderationCase,
        profile: {
          ...profile,
        },
      },
    });

    const response = await PATCH(
      reviewRequest("verified", "本人の投稿を確認しました。"),
      { params: Promise.resolve({ requestId }) },
    );

    await expect(response.json()).resolves.toMatchObject({
      restored: false,
      accountCorrection: { corrected: false, reason: "deletionPending" },
    });
    expect(mocks.profileUpdate).not.toHaveBeenCalled();
    expect(mocks.actionCreate).not.toHaveBeenCalled();
    expect(mocks.notificationCreate).not.toHaveBeenCalled();
  });

  it("対応するなりすまし違反が見つからない場合は停止状態を訂正しない", async () => {
    mocks.violationFindFirst.mockResolvedValueOnce(null);

    const response = await PATCH(
      reviewRequest("verified", "本人の投稿を確認しました。"),
      { params: Promise.resolve({ requestId }) },
    );

    await expect(response.json()).resolves.toMatchObject({
      restored: false,
      accountCorrection: {
        corrected: false,
        reason: "matchingViolationMissing",
      },
    });
    expect(mocks.violationCreate).not.toHaveBeenCalled();
    expect(mocks.profileUpdate).not.toHaveBeenCalled();
    expect(mocks.actionCreate).not.toHaveBeenCalled();
    expect(mocks.notificationCreate).not.toHaveBeenCalled();
  });

  it("停止契機でない本人確認違反でも残存違反を再評価して停止状態を訂正する", async () => {
    mocks.violationFindFirst.mockResolvedValueOnce({
      id: "violation-1",
      reasonCode: "impersonation",
      suspensionTriggered: false,
    });

    const response = await PATCH(
      reviewRequest("verified", "本人の投稿を確認しました。"),
      { params: Promise.resolve({ requestId }) },
    );

    await expect(response.json()).resolves.toMatchObject({
      restored: true,
      accountCorrection: { corrected: true, reason: "corrected" },
    });
    expect(mocks.profileUpdate).toHaveBeenCalledWith({
      where: { id: "profile-1" },
      data: {
        accountModerationStatus: "active",
        suspensionAppealDueAt: null,
      },
    });
  });

  it("すでに有効なアカウントでは訂正記録を重複作成しない", async () => {
    const profile = {
      ...moderationCase.profile,
      status: "active" as const,
      accountModerationStatus: "active" as const,
    };
    mocks.requestFindUnique.mockResolvedValue({
      id: requestId,
      status: "pending",
      profileId: "profile-1",
      postingDeadlineAt: new Date("2999-01-01T00:00:00.000Z"),
      moderationCase: {
        ...moderationCase,
        profile: {
          ...profile,
        },
      },
    });

    const response = await PATCH(
      reviewRequest("verified", "本人の投稿を確認しました。"),
      { params: Promise.resolve({ requestId }) },
    );

    await expect(response.json()).resolves.toMatchObject({
      restored: false,
      accountCorrection: { corrected: false, reason: "alreadyActive" },
    });
    expect(mocks.profileUpdate).not.toHaveBeenCalled();
    expect(mocks.actionCreate).not.toHaveBeenCalled();
    expect(mocks.notificationCreate).not.toHaveBeenCalled();
  });

  it("審査済み申請の再操作を拒否する", async () => {
    mocks.requestFindUnique.mockResolvedValue({
      id: requestId,
      status: "verified",
      profileId: "profile-1",
      postingDeadlineAt: new Date("2999-01-01T00:00:00.000Z"),
      moderationCase,
    });

    const response = await PATCH(
      reviewRequest("verified", "再確認しました。"),
      {
        params: Promise.resolve({ requestId }),
      },
    );

    expect(response.status).toBe(409);
    expect(mocks.requestUpdate).not.toHaveBeenCalled();
  });

  it("投稿期限を過ぎた申請を期限切れにして審査を拒否する", async () => {
    mocks.requestFindUnique.mockResolvedValue({
      id: requestId,
      status: "pending",
      profileId: "profile-1",
      postingDeadlineAt: new Date("2000-01-01T00:00:00.000Z"),
      moderationCase,
    });

    const response = await PATCH(
      reviewRequest("verified", "期限後の投稿を確認しました。"),
      { params: Promise.resolve({ requestId }) },
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "投稿期限を過ぎているため、この本人確認申請は審査できません。",
    });
    expect(mocks.requestUpdateMany).toHaveBeenCalledWith({
      where: {
        moderationCaseId: "case-1",
        status: "pending",
        postingDeadlineAt: { lte: expect.any(Date) },
      },
      data: { status: "expired" },
    });
    expect(mocks.profileUpdate).not.toHaveBeenCalled();
    expect(mocks.caseUpdate).not.toHaveBeenCalled();
    expect(mocks.violationCreate).not.toHaveBeenCalled();
    expect(mocks.actionCreate).not.toHaveBeenCalled();
    expect(mocks.notificationCreate).not.toHaveBeenCalled();
  });
});
