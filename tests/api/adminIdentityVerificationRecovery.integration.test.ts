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
vi.mock("@/lib/clientIp", () => ({ getClientIp: () => null }));

import { PATCH } from "@/app/(site)/api/admin/moderation/identity-verification/[requestId]/route";
import { prisma } from "@/lib/prisma";

describe("本人確認による停止状態・対象コンテンツの復旧", () => {
  const testRunId = crypto.randomUUID();
  let adminUserId = "";
  const profileIds: string[] = [];
  const requestIds: string[] = [];
  let profileCaseId = "";
  let profileViolationId = "";
  let socialProfileId = "";
  let socialCaseId = "";
  let socialRequestId = "";
  let socialLinkId = "";
  let otherSocialLinkId = "";

  beforeAll(async () => {
    const admin = await prisma.adminUser.create({
      data: { authId: `recovery-admin-${testRunId}`, role: "admin" },
      select: { id: true },
    });
    adminUserId = admin.id;
    mocks.authorizeAdminRequest.mockResolvedValue({
      ok: true,
      admin: {
        id: adminUserId,
        authId: `recovery-admin-${testRunId}`,
        role: "admin",
      },
    });
    mocks.consumeAdminActionRateLimit.mockReturnValue({ allowed: true });
    mocks.consumeAdminActionIpRateLimit.mockReturnValue({ allowed: true });

    const profile = await prisma.profile.create({
      data: {
        userId: `recovery-profile-${testRunId}`,
        displayName: "本人確認復旧テスト",
        bio: "統合テスト用データ",
        audioUrl: "https://example.com/audio.mp3",
        audioTitle: "テスト音声",
        status: "hidden",
        accountModerationStatus: "suspended",
        suspensionAppealDueAt: new Date(Date.now() + 60 * 86_400_000),
      },
      select: { id: true },
    });
    profileIds.push(profile.id);
    const moderationCase = await prisma.moderationCase.create({
      data: {
        profileId: profile.id,
        targetType: "profile",
        targetId: profile.id,
        reasonCode: "impersonation",
        reviewMode: "preReview",
        status: "correctionRequired",
        userMessage: "本人確認が必要です。",
      },
      select: { id: true },
    });
    profileCaseId = moderationCase.id;
    const confirmedViolation = await prisma.moderationViolationEvent.create({
      data: {
        profileId: profile.id,
        moderationCaseId: moderationCase.id,
        adminUserId,
        eventType: "confirmed",
        reasonCode: "impersonation",
        suspensionTriggered: true,
        note: "なりすまし確認",
      },
      select: { id: true },
    });
    profileViolationId = confirmedViolation.id;
    await prisma.moderationRequest.create({
      data: {
        profileId: profile.id,
        kind: "accountAppeal",
        message: "本人確認後の解除申請です。",
      },
    });
    const verificationRequest = await prisma.identityVerificationRequest.create(
      {
        data: {
          profileId: profile.id,
          moderationCaseId: moderationCase.id,
          socialUrl: "https://example.com/identity-post",
          plannedContent: "本人確認の投稿です。",
          postingDeadlineAt: new Date(Date.now() + 10 * 60_000),
        },
        select: { id: true },
      },
    );
    requestIds.push(verificationRequest.id);

    const socialProfile = await prisma.profile.create({
      data: {
        userId: `recovery-social-profile-${testRunId}`,
        displayName: "リンク本人確認テスト",
        bio: "統合テスト用データ",
        audioUrl: "",
        audioTitle: "",
        status: "hidden",
        accountModerationStatus: "suspended",
      },
      select: { id: true },
    });
    socialProfileId = socialProfile.id;
    profileIds.push(socialProfileId);
    const links = await prisma.socialLink.createManyAndReturn({
      data: [
        {
          profileId: socialProfileId,
          service: "youtube",
          url: "https://youtube.com/confirmed-link",
          label: "本人リンク",
          status: "hidden",
        },
        {
          profileId: socialProfileId,
          service: "x",
          url: "https://x.com/other-link",
          label: "別リンク",
        },
      ],
      select: { id: true },
    });
    socialLinkId = links[0].id;
    otherSocialLinkId = links[1].id;
    const socialCase = await prisma.moderationCase.create({
      data: {
        profileId: socialProfileId,
        targetType: "socialLink",
        targetId: socialLinkId,
        reasonCode: "impersonation",
        reviewMode: "preReview",
        status: "preReviewPending",
        userMessage: "本人確認が必要です。",
      },
      select: { id: true },
    });
    socialCaseId = socialCase.id;
    await prisma.moderationViolationEvent.create({
      data: {
        profileId: socialProfileId,
        moderationCaseId: socialCaseId,
        adminUserId,
        eventType: "confirmed",
        reasonCode: "impersonation",
        suspensionTriggered: true,
        note: "なりすまし確認",
      },
    });
    const socialRequest = await prisma.identityVerificationRequest.create({
      data: {
        profileId: socialProfileId,
        moderationCaseId: socialCaseId,
        socialLinkId,
        socialUrl: "https://youtube.com/confirmed-link",
        plannedContent: "本人確認の投稿です。",
        postingDeadlineAt: new Date(Date.now() + 10 * 60_000),
      },
      select: { id: true },
    });
    socialRequestId = socialRequest.id;
  });

  afterAll(async () => {
    try {
      await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`select set_config('app.account_deletion', 'enabled', true)`;
        await tx.moderationAction.deleteMany({
          where: { profileId: { in: profileIds } },
        });
        await tx.profile.deleteMany({ where: { id: { in: profileIds } } });
        await tx.adminUser.deleteMany({ where: { id: adminUserId } });
      });
    } finally {
      await prisma.$disconnect();
    }
  });

  it("本人確認で停止・プロフィール・解除申請を一括復旧し、再操作を拒否する", async () => {
    const response = await PATCH(
      new Request(
        `http://localhost/api/admin/moderation/identity-verification/${requestIds[0]}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            decision: "verified",
            note: "本人の投稿を確認しました。",
          }),
        },
      ),
      { params: Promise.resolve({ requestId: requestIds[0] }) },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      caseStatus: "confirmed",
      accountCorrection: { corrected: true, reason: "corrected" },
      restored: true,
    });
    await expect(
      prisma.profile.findUnique({
        where: { id: profileIds[0] },
        select: {
          status: true,
          accountModerationStatus: true,
          suspensionAppealDueAt: true,
        },
      }),
    ).resolves.toMatchObject({
      status: "active",
      accountModerationStatus: "active",
      suspensionAppealDueAt: null,
    });
    await expect(
      prisma.moderationRequest.findFirst({
        where: { profileId: profileIds[0], kind: "accountAppeal" },
      }),
    ).resolves.toMatchObject({ status: "resolved" });
    await expect(
      prisma.moderationViolationEvent.findFirst({
        where: { profileId: profileIds[0], eventType: "revoked" },
      }),
    ).resolves.toMatchObject({ originalViolationEventId: profileViolationId });
    await expect(
      prisma.moderationCase.findUnique({
        where: { id: profileCaseId },
        select: { status: true, resolvedAt: true },
      }),
    ).resolves.toMatchObject({
      status: "confirmed",
      resolvedAt: expect.any(Date),
    });
    await expect(
      prisma.moderationAction.count({ where: { profileId: profileIds[0] } }),
    ).resolves.toBe(2);
    await expect(
      prisma.userNotification.count({ where: { profileId: profileIds[0] } }),
    ).resolves.toBe(2);

    const repeat = await PATCH(
      new Request(
        `http://localhost/api/admin/moderation/identity-verification/${requestIds[0]}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            decision: "verified",
            note: "再確認しました。",
          }),
        },
      ),
      { params: Promise.resolve({ requestId: requestIds[0] }) },
    );
    expect(repeat.status).toBe(409);
    await expect(
      prisma.moderationAction.count({ where: { profileId: profileIds[0] } }),
    ).resolves.toBe(2);
  });

  it("ソーシャルリンク対象では指定リンクだけを公開する", async () => {
    const response = await PATCH(
      new Request(
        `http://localhost/api/admin/moderation/identity-verification/${socialRequestId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            decision: "verified",
            note: "リンク本人を確認しました。",
          }),
        },
      ),
      { params: Promise.resolve({ requestId: socialRequestId }) },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ restored: true });
    await expect(
      prisma.socialLink.findUnique({
        where: { id: socialLinkId },
        select: { status: true },
      }),
    ).resolves.toEqual({ status: "active" });
    await expect(
      prisma.socialLink.findUnique({
        where: { id: otherSocialLinkId },
        select: { status: true },
      }),
    ).resolves.toEqual({ status: "active" });
    await expect(
      prisma.moderationCase.findUnique({
        where: { id: socialCaseId },
        select: { status: true },
      }),
    ).resolves.toEqual({ status: "confirmed" });
    await expect(
      prisma.moderationAction.count({ where: { profileId: socialProfileId } }),
    ).resolves.toBe(2);
  });
});
