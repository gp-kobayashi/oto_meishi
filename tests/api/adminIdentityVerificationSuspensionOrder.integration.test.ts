import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authorizeAdminRequest: vi.fn(),
  consumeAdminActionRateLimit: vi.fn(),
  consumeAdminActionIpRateLimit: vi.fn(),
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

type Fixture = {
  profileId: string;
  caseIds: [string, string];
  requestIds: [string, string];
  violationIds: [string, string];
};

describe("本人確認の違反取消順序と停止状態の再評価", () => {
  const runId = crypto.randomUUID();
  const adminAuthId = `suspension-order-admin-${runId}`;
  let adminId = "";
  const profileIds: string[] = [];

  beforeAll(async () => {
    const admin = await prisma.adminUser.create({
      data: { authId: adminAuthId, role: "admin" },
      select: { id: true },
    });
    adminId = admin.id;
    mocks.authorizeAdminRequest.mockResolvedValue({
      ok: true,
      admin: { id: adminId, authId: adminAuthId, role: "admin" },
    });
    mocks.consumeAdminActionRateLimit.mockReturnValue({ allowed: true });
    mocks.consumeAdminActionIpRateLimit.mockReturnValue({ allowed: true });
  });

  afterAll(async () => {
    try {
      await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`select set_config('app.account_deletion', 'enabled', true)`;
        await tx.moderationAction.deleteMany({
          where: { profileId: { in: profileIds } },
        });
        await tx.profile.deleteMany({ where: { id: { in: profileIds } } });
        await tx.adminUser.deleteMany({ where: { id: adminId } });
      });
    } finally {
      await prisma.$disconnect();
    }
  }, 15_000);

  async function createFixture(
    order: "trigger-first" | "non-trigger-first",
  ): Promise<Fixture> {
    const profile = await prisma.profile.create({
      data: {
        userId: `suspension-order-${order}-${runId}`,
        displayName: "停止再評価テスト",
        bio: "統合テスト用",
        theme: "normal",
        audioUrl: "",
        audioKey: `audio/suspension-order-${order}-${runId}.m4a`,
        audioTitle: "テスト音声",
        audioStatus: "hidden",
        status: "suspended",
        accountModerationStatus: "suspended",
        suspensionAppealDueAt: new Date(Date.now() + 60 * 86_400_000),
      },
      select: { id: true },
    });
    profileIds.push(profile.id);
    const link = await prisma.socialLink.create({
      data: {
        profileId: profile.id,
        service: "x",
        label: "対象リンク",
        url: `https://x.com/suspension-${runId}`,
        status: "hidden",
      },
      select: { id: true },
    });
    const cases = await Promise.all([
      prisma.moderationCase.create({
        data: {
          profileId: profile.id,
          targetType: "audio",
          targetId: profile.id,
          reasonCode: "impersonation",
          reviewMode: "preReview",
          status: "preReviewPending",
          userMessage: "音声の本人確認",
        },
        select: { id: true },
      }),
      prisma.moderationCase.create({
        data: {
          profileId: profile.id,
          targetType: "socialLink",
          targetId: link.id,
          reasonCode: "impersonation",
          reviewMode: "preReview",
          status: "preReviewPending",
          userMessage: "リンクの本人確認",
        },
        select: { id: true },
      }),
    ]);
    const violations =
      await prisma.moderationViolationEvent.createManyAndReturn({
        data: cases.map((item, index) => ({
          profileId: profile.id,
          moderationCaseId: item.id,
          adminUserId: adminId,
          eventType: "confirmed" as const,
          reasonCode: "impersonation" as const,
          suspensionTriggered: index === 0,
          note: "停止再評価テスト",
        })),
        select: { id: true },
      });
    const requests = await Promise.all(
      cases.map((item) =>
        prisma.identityVerificationRequest.create({
          data: {
            profileId: profile.id,
            moderationCaseId: item.id,
            socialLinkId: link.id,
            socialUrl: `https://x.com/suspension-${runId}`,
            plannedContent: "確認投稿を行います。",
            postingDeadlineAt: new Date(Date.now() + 10 * 60_000),
          },
          select: { id: true },
        }),
      ),
    );
    return {
      profileId: profile.id,
      caseIds: [cases[0].id, cases[1].id],
      requestIds: [requests[0].id, requests[1].id],
      violationIds: [violations[0].id, violations[1].id],
    };
  }

  async function approve(requestId: string) {
    return PATCH(
      new Request(
        `http://localhost/api/admin/moderation/identity-verification/${requestId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            decision: "verified",
            note: "本人の投稿を確認しました。",
          }),
        },
      ),
      { params: Promise.resolve({ requestId }) },
    );
  }

  it.each([
    ["停止契機の違反を先に取り消す", "trigger-first" as const, [0, 1] as const],
    [
      "停止契機でない違反を先に取り消す",
      "non-trigger-first" as const,
      [1, 0] as const,
    ],
  ])(
    "%s場合も最後の取消後だけ停止を解除する",
    async (_label, fixtureLabel, order) => {
      const fixture = await createFixture(fixtureLabel);
      const [firstIndex, secondIndex] = order;
      expect((await approve(fixture.requestIds[firstIndex])).status).toBe(200);
      await expect(
        prisma.profile.findUnique({
          where: { id: fixture.profileId },
          select: { status: true, accountModerationStatus: true },
        }),
      ).resolves.toEqual({
        status: "suspended",
        accountModerationStatus: "suspended",
      });
      await expect(
        prisma.moderationViolationEvent.count({
          where: { profileId: fixture.profileId, eventType: "revoked" },
        }),
      ).resolves.toBe(1);
      await expect(
        prisma.identityVerificationRequest.findUnique({
          where: { id: fixture.requestIds[firstIndex] },
          select: { status: true },
        }),
      ).resolves.toEqual({ status: "verified" });
      await expect(
        prisma.identityVerificationRequest.findUnique({
          where: { id: fixture.requestIds[secondIndex] },
          select: { status: true },
        }),
      ).resolves.toEqual({ status: "pending" });
      await expect(
        prisma.moderationCase.findUnique({
          where: { id: fixture.caseIds[firstIndex] },
          select: { status: true },
        }),
      ).resolves.toEqual({ status: "confirmed" });
      await expect(
        prisma.moderationCase.findUnique({
          where: { id: fixture.caseIds[secondIndex] },
          select: { status: true },
        }),
      ).resolves.toEqual({ status: "preReviewPending" });
      await expect(
        prisma.moderationViolationEvent.findFirst({
          where: { profileId: fixture.profileId, eventType: "revoked" },
          select: { originalViolationEventId: true },
        }),
      ).resolves.toEqual({
        originalViolationEventId: fixture.violationIds[firstIndex],
      });
      await expect(
        prisma.moderationAction.count({
          where: { profileId: fixture.profileId },
        }),
      ).resolves.toBe(0);
      expect((await approve(fixture.requestIds[secondIndex])).status).toBe(200);
      await expect(
        prisma.profile.findUnique({
          where: { id: fixture.profileId },
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
        prisma.moderationCase.findMany({
          where: { id: { in: fixture.caseIds } },
          select: { status: true },
        }),
      ).resolves.toEqual(
        expect.arrayContaining([
          { status: "confirmed" },
          { status: "confirmed" },
        ]),
      );
      await expect(
        prisma.identityVerificationRequest.findMany({
          where: { id: { in: fixture.requestIds } },
          select: { status: true },
        }),
      ).resolves.toEqual(
        expect.arrayContaining([
          { status: "verified" },
          { status: "verified" },
        ]),
      );
      await expect(
        prisma.moderationViolationEvent.count({
          where: { profileId: fixture.profileId, eventType: "revoked" },
        }),
      ).resolves.toBe(2);
      await expect(
        prisma.moderationViolationEvent.findMany({
          where: { profileId: fixture.profileId, eventType: "revoked" },
          select: { originalViolationEventId: true },
        }),
      ).resolves.toEqual(
        expect.arrayContaining([
          { originalViolationEventId: fixture.violationIds[0] },
          { originalViolationEventId: fixture.violationIds[1] },
        ]),
      );
      await expect(
        prisma.userNotification.count({
          where: {
            profileId: fixture.profileId,
            title: "利用停止状態を訂正しました",
          },
        }),
      ).resolves.toBe(1);
      await expect(
        prisma.moderationAction.count({
          where: { profileId: fixture.profileId },
        }),
      ).resolves.toBe(3);
      await expect(
        prisma.moderationAction.findFirst({
          where: {
            profileId: fixture.profileId,
            targetType: "profile",
            action: "restore",
            previousStatus: "suspended",
            newStatus: "active",
          },
          select: { id: true },
        }),
      ).resolves.toEqual(expect.objectContaining({ id: expect.any(String) }));
      await expect(
        prisma.moderationAction.count({
          where: { profileId: fixture.profileId },
        }),
      ).resolves.toBeGreaterThan(2);
    },
  );
});
