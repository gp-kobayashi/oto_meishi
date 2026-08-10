import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

describe("違反履歴の追記専用制約", () => {
  const testRunId = crypto.randomUUID();
  const adminAuthId = `immutability-admin-${testRunId}`;
  let profileId = "";
  let adminUserId = "";
  let moderationCaseId = "";
  let violationEventId = "";

  beforeAll(async () => {
    const adminUser = await prisma.adminUser.create({
      data: { authId: adminAuthId, role: "admin" },
      select: { id: true },
    });
    adminUserId = adminUser.id;

    const profile = await prisma.profile.create({
      data: {
        userId: `immutability-${testRunId}`,
        displayName: "違反履歴制約テスト",
        bio: "統合テスト用データ",
        audioUrl: "",
        audioTitle: "",
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
        status: "confirmed",
        userMessage: "違反履歴制約テスト",
        resolvedAt: new Date(),
      },
      select: { id: true },
    });
    moderationCaseId = moderationCase.id;

    const violationEvent = await prisma.moderationViolationEvent.create({
      data: {
        profileId,
        moderationCaseId,
        adminUserId,
        adminAuthId,
        adminRole: "admin",
        eventType: "confirmed",
        reasonCode: "harassment",
        note: "変更してはいけない違反履歴",
      },
      select: { id: true },
    });
    violationEventId = violationEvent.id;
  });

  afterAll(async () => {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`select set_config('app.account_deletion', 'enabled', true)`;
      await tx.profile.deleteMany({ where: { id: profileId } });
    });
    await prisma.adminUser.deleteMany({ where: { id: adminUserId } });
    await prisma.$disconnect();
  });

  it("通常操作による更新と削除を拒否する", async () => {
    await expect(
      prisma.moderationViolationEvent.update({
        where: { id: violationEventId },
        data: { note: "改変後の内容" },
      }),
    ).rejects.toThrow("Moderation history is immutable outside account deletion.");

    await expect(
      prisma.moderationViolationEvent.delete({
        where: { id: violationEventId },
      }),
    ).rejects.toThrow("Moderation history is immutable outside account deletion.");
  });

  it("完全削除トランザクション内の削除だけを許可する", async () => {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`select set_config('app.account_deletion', 'enabled', true)`;
      await tx.moderationViolationEvent.delete({
        where: { id: violationEventId },
      });
    });

    await expect(
      prisma.moderationViolationEvent.findUnique({
        where: { id: violationEventId },
      }),
    ).resolves.toBeNull();
  });
});
