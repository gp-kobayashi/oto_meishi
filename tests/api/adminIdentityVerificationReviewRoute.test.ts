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
    accountModerationStatus: "active" as const,
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
    });
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
          create: mocks.violationCreate,
        },
        moderationAction: { create: mocks.actionCreate },
        userNotification: { create: mocks.notificationCreate },
      }),
    );
  });

  it("本人確認成功時にケースを完了し違反回数を取り消して公開する", async () => {
    const response = await PATCH(reviewRequest("verified", "本人の投稿を確認しました。"), {
      params: Promise.resolve({ requestId }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: "verified",
      caseStatus: "confirmed",
      restored: true,
      revocationId: "revocation-1",
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
      data: expect.objectContaining({ title: "本人確認が完了しました" }),
    });
  });

  it("別の未完了ケースがあれば本人確認成功後も公開しない", async () => {
    mocks.caseCount.mockResolvedValueOnce(1);

    const response = await PATCH(reviewRequest("verified", "本人の投稿を確認しました。"), {
      params: Promise.resolve({ requestId }),
    });

    await expect(response.json()).resolves.toMatchObject({
      status: "verified",
      restored: false,
    });
    expect(mocks.profileUpdate).not.toHaveBeenCalled();
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
