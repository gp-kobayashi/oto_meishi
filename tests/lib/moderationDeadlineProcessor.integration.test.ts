import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { processModerationDeadlines } from "@/lib/moderationDeadlineProcessor";
import { prisma } from "@/lib/prisma";

describe("モデレーション期限処理の統合テスト", () => {
  const testRunId = crypto.randomUUID();
  let profileId = "";
  let moderationCaseId = "";

  beforeAll(async () => {
    const profile = await prisma.profile.create({
      data: {
        userId: `integration-deadline-${testRunId}`,
        displayName: "期限処理確認用",
        bio: "統合テスト用データ",
        theme: "normal",
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
        reasonCode: "harassment",
        reviewMode: "preReview",
        status: "correctionRequired",
        userMessage: "修正が必要です。",
        reviewDueAt: new Date("2026-08-07T23:59:59.000Z"),
        retentionExpiresAt: new Date("2026-10-07T00:00:00.000Z"),
      },
      select: { id: true },
    });
    moderationCaseId = moderationCase.id;
  });

  afterAll(async () => {
    await prisma.$executeRawUnsafe(
      'alter table public."ModerationCaseEvent" disable trigger prevent_moderation_case_event_update_or_delete',
    );
    await prisma.$executeRawUnsafe(
      'alter table public."ModerationAction" disable trigger prevent_moderation_action_update_or_delete',
    );
    try {
      await prisma.moderationAction.deleteMany({ where: { profileId } });
      await prisma.profile.deleteMany({ where: { id: profileId } });
    } finally {
      await prisma.$executeRawUnsafe(
        'alter table public."ModerationCaseEvent" enable trigger prevent_moderation_case_event_update_or_delete',
      );
      await prisma.$executeRawUnsafe(
        'alter table public."ModerationAction" enable trigger prevent_moderation_action_update_or_delete',
      );
      await prisma.$disconnect();
    }
  }, 15_000);

  it("未対応期限超過から利用停止、削除予定化、削除候補化まで進める", async () => {
    const suspensionAt = new Date("2026-08-08T00:00:00.000Z");
    const suspensionResult = await processModerationDeadlines(suspensionAt);

    expect(suspensionResult.suspended).toBe(1);
    await expect(
      prisma.profile.findUnique({
        where: { id: profileId },
        select: {
          status: true,
          accountModerationStatus: true,
          suspensionAppealDueAt: true,
        },
      }),
    ).resolves.toEqual({
      status: "suspended",
      accountModerationStatus: "suspended",
      suspensionAppealDueAt: new Date("2026-10-07T00:00:00.000Z"),
    });

    const schedulingAt = new Date("2026-10-07T00:00:00.000Z");
    const schedulingResult = await processModerationDeadlines(schedulingAt);

    expect(schedulingResult.deletionScheduled).toBe(1);
    await expect(
      prisma.profile.findUnique({
        where: { id: profileId },
        select: {
          accountModerationStatus: true,
          deletionScheduledAt: true,
        },
      }),
    ).resolves.toEqual({
      accountModerationStatus: "deletionPending",
      deletionScheduledAt: new Date("2026-12-06T00:00:00.000Z"),
    });

    const deletionResult = await processModerationDeadlines(
      new Date("2026-12-06T00:00:00.000Z"),
    );
    expect(deletionResult.deletionCandidates).toBe(1);

    const [actions, notifications, events] = await Promise.all([
      prisma.moderationAction.findMany({
        where: { profileId },
        orderBy: { createdAt: "asc" },
        select: {
          action: true,
          actorType: true,
          adminUserId: true,
          previousStatus: true,
          newStatus: true,
        },
      }),
      prisma.userNotification.findMany({
        where: { profileId },
        orderBy: { createdAt: "asc" },
        select: { title: true },
      }),
      prisma.moderationCaseEvent.findMany({
        where: { moderationCaseId },
        orderBy: { createdAt: "asc" },
        select: { eventType: true, actorType: true, actorId: true },
      }),
    ]);

    expect(actions).toEqual([
      {
        action: "suspend",
        actorType: "system",
        adminUserId: null,
        previousStatus: "hidden",
        newStatus: "suspended",
      },
      {
        action: "scheduleDeletion",
        actorType: "system",
        adminUserId: null,
        previousStatus: "suspended",
        newStatus: "deletionPending",
      },
    ]);
    expect(notifications).toEqual([
      { title: "プロフィールの利用停止について" },
      { title: "アカウントの削除予定について" },
    ]);
    expect(events).toEqual([
      { eventType: "accountSuspended", actorType: "system", actorId: null },
      { eventType: "deletionScheduled", actorType: "system", actorId: null },
    ]);
  });
});
