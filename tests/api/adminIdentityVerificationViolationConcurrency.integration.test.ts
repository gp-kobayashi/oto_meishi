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

import { PATCH as reviewIdentity } from "@/app/(site)/api/admin/moderation/identity-verification/[requestId]/route";
import { PATCH as moderateAction } from "@/app/(site)/api/admin/moderation/actions/route";
import { lockModerationProfile } from "@/lib/moderationTransactionLock";
import { prisma } from "@/lib/prisma";

describe("本人確認と新規停止違反の並行審査", () => {
  const testRunId = crypto.randomUUID();
  const adminAuthId = `identity-race-admin-${testRunId}`;
  const userAuthId = `identity-race-user-${testRunId}`;
  let adminUserId = "";
  let profileId = "";
  let impersonationCaseId = "";
  let verificationRequestId = "";

  beforeAll(async () => {
    const admin = await prisma.adminUser.create({
      data: { authId: adminAuthId, role: "admin" },
      select: { id: true },
    });
    adminUserId = admin.id;
    const profile = await prisma.profile.create({
      data: {
        userId: userAuthId,
        authId: userAuthId,
        displayName: "本人確認競合テスト",
        bio: "統合テスト用プロフィール",
        theme: "normal",
        audioUrl: "",
        audioTitle: "",
        status: "hidden",
        accountModerationStatus: "suspended",
        suspensionAppealDueAt: new Date(Date.now() + 60 * 86_400_000),
      },
      select: { id: true },
    });
    profileId = profile.id;
    const impersonationCase = await prisma.moderationCase.create({
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
    impersonationCaseId = impersonationCase.id;
    await prisma.moderationViolationEvent.create({
      data: {
        profileId,
        moderationCaseId: impersonationCaseId,
        adminUserId,
        adminAuthId,
        adminRole: "admin",
        eventType: "confirmed",
        reasonCode: "impersonation",
        suspensionTriggered: true,
        note: "なりすましの疑い",
      },
    });
    const verification = await prisma.identityVerificationRequest.create({
      data: {
        profileId,
        moderationCaseId: impersonationCaseId,
        socialUrl: "https://example.com/identity-race",
        plannedContent: "本人のプロフィールであることを確認する投稿",
        postingDeadlineAt: new Date(Date.now() + 10 * 60_000),
      },
      select: { id: true },
    });
    verificationRequestId = verification.id;
  });

  afterAll(async () => {
    try {
      await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`select set_config('app.account_deletion', 'enabled', true)`;
        await tx.moderationAction.deleteMany({ where: { profileId } });
        await tx.profile.deleteMany({ where: { id: profileId } });
        await tx.adminUser.deleteMany({ where: { id: adminUserId } });
      });
    } finally {
      await prisma.$disconnect();
    }
  }, 15_000);

  it("本人確認が先行しても新規即時停止違反でactiveに戻らない", async () => {
    mocks.authorizeAdminRequest.mockResolvedValue({
      ok: true,
      admin: { id: adminUserId, authId: adminAuthId, role: "admin" },
    });
    mocks.consumeAdminActionRateLimit.mockReturnValue({ allowed: true });
    mocks.consumeAdminActionIpRateLimit.mockReturnValue({ allowed: true });

    const baseline = await prisma.$queryRaw<{ count: bigint }[]>`
      select count(*)::bigint as count
      from pg_locks
      where locktype = 'advisory' and not granted
    `;
    const baselineWaiters = Number(baseline[0]?.count ?? BigInt(0));
    let releaseHolder!: () => void;
    let resolveHolderReady!: () => void;
    const holderReady = new Promise<void>((resolve) => {
      resolveHolderReady = resolve;
    });
    const releaseHolderPromise = new Promise<void>((resolve) => {
      releaseHolder = resolve;
    });
    const holder = prisma.$transaction(async (tx) => {
      await lockModerationProfile(tx, profileId);
      resolveHolderReady();
      await releaseHolderPromise;
    });
    const waitForWaiters = async (expected: number) => {
      const deadline = Date.now() + 2_000;
      while (Date.now() < deadline) {
        const rows = await prisma.$queryRaw<{ count: bigint }[]>`
          select count(*)::bigint as count
          from pg_locks
          where locktype = 'advisory' and not granted
        `;
        if (Number(rows[0]?.count ?? BigInt(0)) >= expected) return;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      throw new Error(`Timed out waiting for ${expected} advisory lock waiters`);
    };

    let identityPromise: Promise<Response> | undefined;
    let actionPromise: Promise<Response> | undefined;
    try {
      await holderReady;
      identityPromise = reviewIdentity(
        new Request(
          `http://localhost/api/admin/identity-verification/${verificationRequestId}`,
          {
            method: "PATCH",
            headers: {
              Authorization: "Bearer admin-token",
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              decision: "verified",
              note: "本人の投稿を確認しました。",
            }),
          },
        ),
        { params: Promise.resolve({ requestId: verificationRequestId }) },
      );
      await waitForWaiters(baselineWaiters + 1);
      actionPromise = moderateAction(
        new Request("http://localhost/api/admin/moderation/actions", {
          method: "PATCH",
          headers: {
            Authorization: "Bearer admin-token",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            targetType: "profile",
            targetId: profileId,
            action: "hide",
            reason: "個人情報を含む脅迫のため",
            reasonCode: "threatOrPersonalData",
          }),
        }),
      );
      await waitForWaiters(baselineWaiters + 2);
      releaseHolder();
      const [identityResponse, actionResponse] = await Promise.all([
        identityPromise,
        actionPromise,
      ]);
      expect(identityResponse.status).toBe(200);
      expect(actionResponse.status).toBe(200);

    } finally {
      releaseHolder();
      await holder;
      if (identityPromise) await identityPromise.catch(() => undefined);
      if (actionPromise) await actionPromise.catch(() => undefined);
    }

    const [
      profile,
      impersonationViolations,
      threatCase,
      threatViolations,
      actions,
      notifications,
    ] =
      await Promise.all([
        prisma.profile.findUnique({
          where: { id: profileId },
          select: { status: true, accountModerationStatus: true },
        }),
        prisma.moderationViolationEvent.findMany({
          where: { moderationCaseId: impersonationCaseId },
          orderBy: { createdAt: "asc" },
          select: { eventType: true, suspensionTriggered: true },
        }),
        prisma.moderationCase.findFirst({
          where: { profileId, reasonCode: "threatOrPersonalData" },
          select: { id: true, status: true },
        }),
        prisma.moderationViolationEvent.findMany({
          where: { profileId, reasonCode: "threatOrPersonalData" },
          select: { eventType: true, suspensionTriggered: true },
        }),
        prisma.moderationAction.findMany({
          where: { profileId },
          orderBy: { createdAt: "asc" },
          select: { targetType: true, action: true },
        }),
        prisma.userNotification.findMany({
          where: { profileId },
          select: { title: true },
        }),
      ]);

    expect(profile).toEqual({
      status: "suspended",
      accountModerationStatus: "suspended",
    });
    expect(impersonationViolations).toEqual([
      { eventType: "confirmed", suspensionTriggered: true },
      { eventType: "revoked", suspensionTriggered: false },
    ]);
    expect(threatCase).toEqual({
      id: expect.any(String),
      status: "correctionRequired",
    });
    expect(threatViolations).toEqual([
      { eventType: "confirmed", suspensionTriggered: true },
    ]);
    expect(actions).toHaveLength(3);
    expect(notifications).toHaveLength(3);
  });
});
