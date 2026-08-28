import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { lockModerationProfile } from "@/lib/moderationTransactionLock";
import { processModerationDeadlines } from "@/lib/moderationDeadlineProcessor";
import { prisma } from "@/lib/prisma";

describe("期限処理と修正提出の並行実行", () => {
  const testRunId = crypto.randomUUID();
  const userId = `deadline-race-${testRunId}`;
  let profileId = "";
  let caseAId = "";
  let caseBId = "";

  beforeAll(async () => {
    const profile = await prisma.profile.create({
      data: {
        userId,
        displayName: "期限処理競合テスト",
        bio: "統合テスト用プロフィール",
        theme: "normal",
        audioUrl: "",
        audioTitle: "",
        status: "hidden",
        accountModerationStatus: "active",
      },
      select: { id: true },
    });
    profileId = profile.id;
    const overdue = new Date("2026-08-01T00:00:00.000Z");
    const cases = await Promise.all(
      [
        { label: "case-a", targetType: "profile" as const, targetId: profileId },
        { label: "case-b", targetType: "audio" as const, targetId: profileId },
      ].map(({ label, targetType, targetId }) =>
        prisma.moderationCase.create({
          data: {
            profileId,
            targetType,
            targetId,
            reasonCode: "harassment",
            reviewMode: "preReview",
            status: "correctionRequired",
            userMessage: `期限処理競合テスト ${label}`,
            reviewDueAt: overdue,
            retentionExpiresAt: new Date("2026-10-01T00:00:00.000Z"),
          },
          select: { id: true },
        }),
      ),
    );
    caseAId = cases[0].id;
    caseBId = cases[1].id;
  });

  afterAll(async () => {
    try {
      await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`select set_config('app.account_deletion', 'enabled', true)`;
        await tx.moderationAction.deleteMany({ where: { profileId } });
        await tx.profile.deleteMany({ where: { id: profileId } });
      });
    } finally {
      await prisma.$disconnect();
    }
  }, 15_000);

  it("修正提出が期限処理の選定後に入っても利用停止しない", async () => {
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
      await tx.moderationCase.update({
        where: { id: caseAId },
        data: {
          status: "preReviewPending",
          reviewMode: "preReview",
          reviewDueAt: new Date(Date.now() + 60 * 86_400_000),
        },
      });
      await tx.moderationSnapshot.create({
        data: {
          moderationCaseId: caseAId,
          kind: "corrected",
          content: { changed: true },
          expiresAt: new Date(Date.now() + 60 * 86_400_000),
        },
      });
      await tx.moderationCaseEvent.create({
        data: {
          moderationCaseId: caseAId,
          eventType: "contentChanged",
          actorType: "user",
          actorId: userId,
          previousStatus: "correctionRequired",
          newStatus: "preReviewPending",
          details: { targetType: "profile" },
        },
      });
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

    let processor:
      | Promise<Awaited<ReturnType<typeof processModerationDeadlines>>>
      | undefined;
    try {
      await holderReady;
      processor = processModerationDeadlines(
        new Date("2026-08-08T00:00:00.000Z"),
      );
      await waitForWaiters(baselineWaiters + 1);
      releaseHolder();
      const result = await processor;
      await holder;

      expect(result).toMatchObject({ suspended: 0, skipped: 1, failed: 0 });
      const [profile, caseA, caseB, actions, notifications, suspensionEvents] =
        await Promise.all([
          prisma.profile.findUnique({
            where: { id: profileId },
            select: { status: true, accountModerationStatus: true },
          }),
          prisma.moderationCase.findUnique({
            where: { id: caseAId },
            select: { status: true },
          }),
          prisma.moderationCase.findUnique({
            where: { id: caseBId },
            select: { status: true },
          }),
          prisma.moderationAction.count({ where: { profileId } }),
          prisma.userNotification.count({ where: { profileId } }),
          prisma.moderationCaseEvent.count({
            where: {
              moderationCase: { profileId },
              eventType: "accountSuspended",
            },
          }),
        ]);
      expect(profile).toEqual({
        status: "hidden",
        accountModerationStatus: "active",
      });
      expect(caseA).toEqual({ status: "preReviewPending" });
      expect(caseB).toEqual({ status: "correctionRequired" });
      expect(actions).toBe(0);
      expect(notifications).toBe(0);
      expect(suspensionEvents).toBe(0);
    } finally {
      releaseHolder();
      await holder;
      if (processor) await processor.catch(() => undefined);
    }
  });
});
