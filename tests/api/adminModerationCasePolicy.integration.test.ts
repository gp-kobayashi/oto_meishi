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

import { PATCH as reviewCase } from "@/app/(site)/api/admin/moderation/cases/[caseId]/route";
import { PATCH as reviewIdentity } from "@/app/(site)/api/admin/moderation/identity-verification/[requestId]/route";
import { PATCH as reviewAppeal } from "@/app/(site)/api/admin/moderation/requests/[requestId]/route";
import { prisma } from "@/lib/prisma";

describe("なりすまし案件の審査導線と停止状態", () => {
  const runId = crypto.randomUUID();
  const profileIds: string[] = [];
  let adminId = "";
  let profileId = "";
  const cases: { id: string; violationId: string; requestId: string }[] = [];
  let appealId = "";

  beforeAll(async () => {
    const admin = await prisma.adminUser.create({
      data: { authId: `case-policy-admin-${runId}`, role: "admin" },
      select: { id: true },
    });
    adminId = admin.id;
    mocks.authorizeAdminRequest.mockResolvedValue({
      ok: true,
      admin: {
        id: adminId,
        authId: `case-policy-admin-${runId}`,
        role: "admin",
      },
    });
    mocks.consumeAdminActionRateLimit.mockReturnValue({ allowed: true });
    mocks.consumeAdminActionIpRateLimit.mockReturnValue({ allowed: true });

    const profile = await prisma.profile.create({
      data: {
        userId: `case-policy-profile-${runId}`,
        displayName: "なりすまし審査テスト",
        bio: "統合テスト用",
        audioUrl: "",
        audioTitle: "",
        status: "suspended",
        accountModerationStatus: "suspended",
        suspensionAppealDueAt: new Date(Date.now() + 60 * 86_400_000),
      },
      select: { id: true },
    });
    profileId = profile.id;
    profileIds.push(profileId);
    const links = await prisma.socialLink.createManyAndReturn({
      data: [0, 1].map((index) => ({
        profileId,
        service: "x",
        label: `対象リンク${index + 1}`,
        url: `https://x.com/case-policy-${index}-${runId}`,
        status: "hidden" as const,
      })),
      select: { id: true },
    });

    for (const index of [0, 1]) {
      const moderationCase = await prisma.moderationCase.create({
        data: {
          profileId,
          targetType: "socialLink",
          targetId: links[index].id,
          reasonCode: "impersonation",
          reviewMode: "preReview",
          status: "preReviewPending",
          userMessage: `本人確認が必要です（${index + 1}）。`,
        },
        select: { id: true },
      });
      const violation = await prisma.moderationViolationEvent.create({
        data: {
          profileId,
          moderationCaseId: moderationCase.id,
          adminUserId: adminId,
          eventType: "confirmed",
          reasonCode: "impersonation",
          suspensionTriggered: index === 0,
          note: "なりすまし確認",
        },
        select: { id: true },
      });
      const verificationRequest =
        await prisma.identityVerificationRequest.create({
          data: {
            profileId,
            moderationCaseId: moderationCase.id,
            socialUrl: `https://x.com/case-policy-${index}-${runId}`,
            plannedContent: "本人確認の投稿です。",
            postingDeadlineAt: new Date(Date.now() + 10 * 60_000),
          },
          select: { id: true },
        });
      cases.push({
        id: moderationCase.id,
        violationId: violation.id,
        requestId: verificationRequest.id,
      });
    }
    const appeal = await prisma.moderationRequest.create({
      data: {
        profileId,
        kind: "accountAppeal",
        message: "利用停止解除を申請します。",
      },
      select: { id: true },
    });
    appealId = appeal.id;
  });

  afterAll(async () => {
    try {
      await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`select set_config('app.account_deletion', 'enabled', true)`;
        await tx.moderationAction.deleteMany({ where: { profileId } });
        await tx.profile.deleteMany({ where: { id: { in: profileIds } } });
        await tx.adminUser.deleteMany({ where: { id: adminId } });
      });
    } finally {
      await prisma.$disconnect();
    }
  });

  const identityRequest = (requestId: string) =>
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
    );

  it("通常approveを拒否し、本人確認ごとに対象を処理する", async () => {
    const regularResponse = await reviewCase(
      new Request("http://localhost/api/admin/moderation/cases", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decision: "approve",
          reason: "修正を確認しました。",
          reviewedSnapshotId: "unused",
        }),
      }),
      { params: Promise.resolve({ caseId: cases[0].id }) },
    );
    expect(regularResponse.status).toBe(409);
    expect(
      await prisma.moderationCase.findUnique({
        where: { id: cases[0].id },
        select: { status: true },
      }),
    ).toEqual({ status: "preReviewPending" });
    expect(
      await prisma.moderationViolationEvent.count({
        where: { profileId, eventType: "confirmed" },
      }),
    ).toBe(2);
    expect(
      await prisma.moderationViolationEvent.count({
        where: { profileId, eventType: "revoked" },
      }),
    ).toBe(0);

    const firstResponse = await reviewIdentity(
      identityRequest(cases[0].requestId),
      {
        params: Promise.resolve({ requestId: cases[0].requestId }),
      },
    );
    expect(firstResponse.status).toBe(200);
    expect(
      await prisma.profile.findUnique({
        where: { id: profileId },
        select: { status: true, accountModerationStatus: true },
      }),
    ).toEqual({ status: "suspended", accountModerationStatus: "suspended" });
    expect(
      await prisma.moderationViolationEvent.count({
        where: { profileId, eventType: "revoked" },
      }),
    ).toBe(1);

    const appealResponse = await reviewAppeal(
      new Request("http://localhost/api/admin/moderation/requests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "resolved",
          responseMessage: "解除します。",
        }),
      }),
      { params: Promise.resolve({ requestId: appealId }) },
    );
    expect(appealResponse.status).toBe(409);
    expect(
      await prisma.moderationRequest.findUnique({
        where: { id: appealId },
        select: { status: true },
      }),
    ).toEqual({ status: "pending" });

    const secondResponse = await reviewIdentity(
      identityRequest(cases[1].requestId),
      {
        params: Promise.resolve({ requestId: cases[1].requestId }),
      },
    );
    expect(secondResponse.status).toBe(200);
    expect(
      await prisma.profile.findUnique({
        where: { id: profileId },
        select: {
          status: true,
          accountModerationStatus: true,
          suspensionAppealDueAt: true,
        },
      }),
    ).toMatchObject({
      status: "active",
      accountModerationStatus: "active",
      suspensionAppealDueAt: null,
    });
    expect(
      await prisma.moderationViolationEvent.findMany({
        where: { profileId, eventType: "revoked" },
        select: { originalViolationEventId: true },
      }),
    ).toEqual(
      expect.arrayContaining(
        cases.map(({ violationId }) => ({
          originalViolationEventId: violationId,
        })),
      ),
    );
    expect(
      await prisma.moderationRequest.findUnique({
        where: { id: appealId },
        select: { status: true },
      }),
    ).toEqual({ status: "resolved" });
    expect(
      await prisma.socialLink.count({
        where: { profileId, status: "active" },
      }),
    ).toBe(2);
    expect(
      await prisma.socialLink.count({
        where: { profileId, status: "hidden" },
      }),
    ).toBe(0);
    expect(
      await prisma.moderationCase.findMany({
        where: { id: { in: cases.map(({ id }) => id) } },
        select: { status: true },
      }),
    ).toEqual(
      expect.arrayContaining([
        { status: "confirmed" },
        { status: "confirmed" },
      ]),
    );
    expect(
      await prisma.identityVerificationRequest.count({
        where: { profileId, status: "verified" },
      }),
    ).toBe(2);
  });
});
