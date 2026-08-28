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

import { PATCH } from "@/app/(site)/api/admin/moderation/cases/[caseId]/route";
import { lockModerationProfile } from "@/lib/moderationTransactionLock";
import { prisma } from "@/lib/prisma";

describe("ケース審査とユーザー修正の並行実行", () => {
  const testRunId = crypto.randomUUID();
  const adminAuthId = `case-race-admin-${testRunId}`;
  const userId = `case-race-user-${testRunId}`;
  let adminUserId = "";
  let profileId = "";
  let caseId = "";
  let snapshotAId = "";

  beforeAll(async () => {
    const admin = await prisma.adminUser.create({
      data: { authId: adminAuthId, role: "admin" },
      select: { id: true },
    });
    adminUserId = admin.id;

    const profile = await prisma.profile.create({
      data: {
        userId,
        authId: `case-race-auth-${testRunId}`,
        displayName: "競合確認用プロフィール",
        bio: "統合テスト用データ",
        theme: "normal",
        audioUrl: "",
        audioKey: "audio/case-race-a.m4a",
        audioContentHash: "a".repeat(64),
        audioTitle: "競合確認用音声",
        audioStatus: "hidden",
      },
      select: { id: true },
    });
    profileId = profile.id;

    const moderationCase = await prisma.moderationCase.create({
      data: {
        profileId,
        targetType: "audio",
        targetId: profileId,
        reasonCode: "inappropriateContent",
        reviewMode: "preReview",
        status: "preReviewPending",
        userMessage: "音声を確認してください。",
      },
      select: { id: true },
    });
    caseId = moderationCase.id;

    const snapshot = await prisma.moderationSnapshot.create({
      data: {
        moderationCaseId: caseId,
        kind: "corrected",
        content: { audioKey: "audio/case-race-a.m4a" },
        contentHash: "a".repeat(64),
        expiresAt: new Date(Date.now() + 60 * 86_400_000),
      },
      select: { id: true },
    });
    snapshotAId = snapshot.id;
  });

  afterAll(async () => {
    try {
      await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`select set_config('app.account_deletion', 'enabled', true)`;
        await tx.profile.deleteMany({ where: { id: profileId } });
        await tx.adminUser.deleteMany({ where: { id: adminUserId } });
      });
    } finally {
      await prisma.$disconnect();
    }
  }, 15_000);

  it("ロック待機後に修正された音声を管理者が承認しない", async () => {
    mocks.authorizeAdminRequest.mockResolvedValue({
      ok: true,
      admin: { id: adminUserId, authId: adminAuthId, role: "admin" },
    });
    mocks.consumeAdminActionRateLimit.mockReturnValue({ allowed: true });
    mocks.consumeAdminActionIpRateLimit.mockReturnValue({ allowed: true });

    let releaseUserUpdate!: () => void;
    const userUpdateStarted = new Promise<void>((resolve) => {
      releaseUserUpdate = resolve;
    });
    let resolveUserLockAcquired!: () => void;
    const userLockAcquired = new Promise<void>((resolve) => {
      resolveUserLockAcquired = resolve;
    });
    const userTransaction = prisma.$transaction(async (tx) => {
      await lockModerationProfile(tx, profileId);
      resolveUserLockAcquired();
      await userUpdateStarted;
      await tx.profile.update({
        where: { id: profileId },
        data: {
          audioKey: "audio/case-race-b.m4a",
          audioContentHash: "b".repeat(64),
          audioStatus: "hidden",
        },
      });
      await tx.moderationSnapshot.create({
        data: {
          moderationCaseId: caseId,
          kind: "corrected",
          content: { audioKey: "audio/case-race-b.m4a" },
          contentHash: "b".repeat(64),
          expiresAt: new Date(Date.now() + 60 * 86_400_000),
        },
      });
      await tx.moderationCaseEvent.create({
        data: {
          moderationCaseId: caseId,
          eventType: "contentChanged",
          actorType: "user",
          actorId: `case-race-auth-${testRunId}`,
          previousStatus: "preReviewPending",
          newStatus: "preReviewPending",
          details: { targetType: "audio" },
        },
      });
    });

    await userLockAcquired;
    const reviewPromise = PATCH(
      new Request(`http://localhost/api/admin/moderation/cases/${caseId}`, {
        method: "PATCH",
        headers: {
          Authorization: "Bearer integration-admin-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          decision: "approve",
          reason: "Aを確認しました。",
          reviewedSnapshotId: snapshotAId,
        }),
      }),
      { params: Promise.resolve({ caseId }) },
    );

    let reviewFinished = false;
    void reviewPromise.then(() => {
      reviewFinished = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(reviewFinished).toBe(false);

    releaseUserUpdate();
    await userTransaction;
    const response = await reviewPromise;
    expect(response.status).toBe(409);

    const [profile, moderationCase, confirmedEvents, actions, notifications] =
      await Promise.all([
        prisma.profile.findUnique({
          where: { id: profileId },
          select: { audioStatus: true, audioKey: true, audioContentHash: true },
        }),
        prisma.moderationCase.findUnique({
          where: { id: caseId },
          select: { status: true },
        }),
        prisma.moderationCaseEvent.count({
          where: { moderationCaseId: caseId, eventType: "reviewApproved" },
        }),
        prisma.moderationAction.count({ where: { profileId } }),
        prisma.userNotification.count({ where: { profileId } }),
      ]);

    expect(profile).toEqual({
      audioStatus: "hidden",
      audioKey: "audio/case-race-b.m4a",
      audioContentHash: "b".repeat(64),
    });
    expect(moderationCase).toEqual({ status: "preReviewPending" });
    expect(confirmedEvents).toBe(0);
    expect(actions).toBe(0);
    expect(notifications).toBe(0);
  });
});
