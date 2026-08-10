import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const { mocks } = vi.hoisted(() => ({
  mocks: {
    authorizeAdminRequest: vi.fn(),
    consumeAdminActionRateLimit: vi.fn(),
    consumeAdminActionIpRateLimit: vi.fn(),
  },
}));

vi.mock("@/lib/adminAuth", () => ({
  authorizeAdminRequest: mocks.authorizeAdminRequest,
}));
vi.mock("@/lib/adminActionRateLimit", () => ({
  consumeAdminActionRateLimit: mocks.consumeAdminActionRateLimit,
  consumeAdminActionIpRateLimit: mocks.consumeAdminActionIpRateLimit,
}));

import { PATCH } from "@/app/(site)/api/admin/moderation/identity-verification/[requestId]/route";
import { prisma } from "@/lib/prisma";

describe("期限切れ本人確認申請の管理者審査", () => {
  const testRunId = crypto.randomUUID();
  let adminUserId = "";
  let profileId = "";
  let requestId = "";

  beforeAll(async () => {
    const adminUser = await prisma.adminUser.create({
      data: { authId: `deadline-admin-${testRunId}`, role: "admin" },
      select: { id: true },
    });
    adminUserId = adminUser.id;

    const profile = await prisma.profile.create({
      data: {
        userId: `deadline-profile-${testRunId}`,
        displayName: "期限切れ審査テスト",
        bio: "統合テスト用データ",
        audioUrl: "",
        audioTitle: "",
        status: "hidden",
      },
      select: { id: true },
    });
    profileId = profile.id;

    const moderationCase = await prisma.moderationCase.create({
      data: {
        profileId,
        targetType: "profile",
        targetId: profileId,
        reasonCode: "impersonation",
        reviewMode: "preReview",
        status: "correctionRequired",
        userMessage: "本人確認が必要です。",
      },
      select: { id: true },
    });

    const verificationRequest =
      await prisma.identityVerificationRequest.create({
        data: {
          profileId,
          moderationCaseId: moderationCase.id,
          socialUrl: "https://example.com/deadline-test",
          plannedContent: "期限内に投稿する予定でした。",
          createdAt: new Date(Date.now() - 20 * 60_000),
          postingDeadlineAt: new Date(Date.now() - 10 * 60_000),
        },
        select: { id: true },
      });
    requestId = verificationRequest.id;

    mocks.authorizeAdminRequest.mockResolvedValue({
      ok: true,
      admin: {
        id: adminUserId,
        authId: `deadline-admin-${testRunId}`,
        role: "admin",
      },
    });
    mocks.consumeAdminActionRateLimit.mockReturnValue({ allowed: true });
    mocks.consumeAdminActionIpRateLimit.mockReturnValue({ allowed: true });
  });

  afterAll(async () => {
    await prisma.profile.deleteMany({ where: { id: profileId } });
    await prisma.adminUser.deleteMany({ where: { id: adminUserId } });
    await prisma.$disconnect();
  });

  it("期限切れへ更新して審査処理を開始しない", async () => {
    const response = await PATCH(
      new Request(
        `http://localhost/api/admin/moderation/identity-verification/${requestId}`,
        {
          method: "PATCH",
          headers: {
            Authorization: "Bearer integration-admin-token",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            decision: "verified",
            note: "期限後の投稿を確認しました。",
          }),
        },
      ),
      { params: Promise.resolve({ requestId }) },
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "投稿期限を過ぎているため、この本人確認申請は審査できません。",
    });
    await expect(
      prisma.identityVerificationRequest.findUnique({
        where: { id: requestId },
        select: { status: true, reviewedAt: true },
      }),
    ).resolves.toEqual({ status: "expired", reviewedAt: null });
    await expect(
      prisma.moderationAction.count({ where: { profileId } }),
    ).resolves.toBe(0);
  });
});
