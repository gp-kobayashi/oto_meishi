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
    caseCount: vi.fn(),
    caseUpdate: vi.fn(),
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
    mocks.caseCount.mockResolvedValue(0);
    mocks.caseUpdate.mockResolvedValue({ id: "case-1" });
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
    mocks.transaction.mockImplementation(async (callback: (tx: unknown) => unknown) =>
      callback({
        $executeRawUnsafe: mocks.executeRaw,
        identityVerificationRequest: {
          findUnique: mocks.requestFindUnique,
          update: mocks.requestUpdate,
        },
        moderationCase: {
          count: mocks.caseCount,
          update: mocks.caseUpdate,
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
    const response = await PATCH(reviewRequest("verified", "本人の投稿を確認しました。"), {
      params: Promise.resolve({ requestId }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: "verified",
      caseStatus: "confirmed",
      restored: false,
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
    expect(mocks.profileUpdate).toHaveBeenCalledWith({
      where: { id: "profile-1" },
      data: {
        accountModerationStatus: "active",
        suspensionAppealDueAt: null,
      },
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

    const response = await PATCH(reviewRequest("verified", "本人の投稿を確認しました。"), {
      params: Promise.resolve({ requestId }),
    });

    await expect(response.json()).resolves.toMatchObject({
      status: "verified",
      restored: false,
      accountCorrection: { corrected: true },
    });
    expect(mocks.profileUpdate).toHaveBeenCalled();
  });

  it("確認できない場合はケースを修正待ちにして理由を通知する", async () => {
    const response = await PATCH(reviewRequest("rejected", "申請内容と投稿が一致しません。"), {
      params: Promise.resolve({ requestId }),
    });

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
  });

  it("削除処理中のアカウントは停止状態を訂正しない", async () => {
    mocks.requestFindUnique.mockResolvedValueOnce({
      id: requestId,
      status: "pending",
      profileId: "profile-1",
      postingDeadlineAt: new Date("2999-01-01T00:00:00.000Z"),
      moderationCase: {
        ...moderationCase,
        profile: {
          ...moderationCase.profile,
          deletionProcessingStartedAt: new Date("2025-01-01T00:00:00.000Z"),
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
    mocks.requestFindUnique.mockResolvedValueOnce({
      id: requestId,
      status: "pending",
      profileId: "profile-1",
      postingDeadlineAt: new Date("2999-01-01T00:00:00.000Z"),
      moderationCase: {
        ...moderationCase,
        profile: {
          ...moderationCase.profile,
          accountModerationStatus: "deletionPending",
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
      accountCorrection: { corrected: false, reason: "matchingViolationMissing" },
    });
    expect(mocks.violationCreate).not.toHaveBeenCalled();
    expect(mocks.profileUpdate).not.toHaveBeenCalled();
    expect(mocks.actionCreate).not.toHaveBeenCalled();
    expect(mocks.notificationCreate).not.toHaveBeenCalled();
  });

  it("停止を発生させていない本人確認違反は停止状態を訂正しない", async () => {
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
      restored: false,
      accountCorrection: {
        corrected: false,
        reason: "matchingViolationNotSuspensionTrigger",
      },
    });
    expect(mocks.profileUpdate).not.toHaveBeenCalled();
    expect(mocks.actionCreate).not.toHaveBeenCalled();
    expect(mocks.notificationCreate).not.toHaveBeenCalled();
  });

  it("すでに有効なアカウントでは訂正記録を重複作成しない", async () => {
    mocks.requestFindUnique.mockResolvedValueOnce({
      id: requestId,
      status: "pending",
      profileId: "profile-1",
      postingDeadlineAt: new Date("2999-01-01T00:00:00.000Z"),
      moderationCase: {
        ...moderationCase,
        profile: {
          ...moderationCase.profile,
          accountModerationStatus: "active",
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
    mocks.requestFindUnique.mockResolvedValueOnce({
      id: requestId,
      status: "verified",
      profileId: "profile-1",
      postingDeadlineAt: new Date("2999-01-01T00:00:00.000Z"),
      moderationCase,
    });

    const response = await PATCH(reviewRequest("verified", "再確認しました。"), {
      params: Promise.resolve({ requestId }),
    });

    expect(response.status).toBe(409);
    expect(mocks.requestUpdate).not.toHaveBeenCalled();
  });

  it("投稿期限を過ぎた申請を期限切れにして審査を拒否する", async () => {
    mocks.requestFindUnique.mockResolvedValueOnce({
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
    expect(mocks.requestUpdate).toHaveBeenCalledWith({
      where: { id: requestId },
      data: { status: "expired" },
    });
    expect(mocks.profileUpdate).not.toHaveBeenCalled();
    expect(mocks.caseUpdate).not.toHaveBeenCalled();
    expect(mocks.violationCreate).not.toHaveBeenCalled();
    expect(mocks.actionCreate).not.toHaveBeenCalled();
    expect(mocks.notificationCreate).not.toHaveBeenCalled();
  });
});
