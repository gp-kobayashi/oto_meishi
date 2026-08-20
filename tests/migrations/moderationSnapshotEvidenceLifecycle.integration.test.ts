import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

describe("モデレーション音声証拠のライフサイクル", () => {
  const testRunId = crypto.randomUUID();
  const userId = `snapshot-lifecycle-${testRunId}`;
  let profileId = "";
  let snapshotId = "";

  beforeAll(async () => {
    const profile = await prisma.profile.create({
      data: {
        userId,
        displayName: "音声証拠ライフサイクルテスト",
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
        reasonCode: "other",
        reviewMode: "preReview",
        status: "confirmed",
        userMessage: "ライフサイクルテスト",
        resolvedAt: new Date("2026-08-01T00:00:00.000Z"),
      },
      select: { id: true },
    });

    const snapshot = await prisma.moderationSnapshot.create({
      data: {
        moderationCaseId: moderationCase.id,
        kind: "reported",
        content: { audioTitle: "証拠音声" },
        storageObjectKey: `audio/${testRunId}/evidence.m4a`,
        expiresAt: new Date("2026-08-02T00:00:00.000Z"),
      },
      select: { id: true, storageObjectKey: true },
    });
    snapshotId = snapshot.id;
  });

  afterAll(async () => {
    await prisma.$executeRawUnsafe(
      'alter table public."ModerationSnapshot" disable trigger prevent_moderation_snapshot_update_or_delete',
    );
    try {
      await prisma.profile.deleteMany({ where: { id: profileId } });
    } finally {
      await prisma.$executeRawUnsafe(
        'alter table public."ModerationSnapshot" enable trigger prevent_moderation_snapshot_update_or_delete',
      );
      await prisma.$disconnect();
    }
  }, 15_000);

  it("保持期限を更新しても不変スナップショットは変更できない", async () => {
    const initialRetainUntil = new Date("2026-08-02T00:00:00.000Z");
    const approvedRetainUntil = new Date("2026-09-30T00:00:00.000Z");

    await prisma.moderationSnapshotEvidenceLifecycle.create({
      data: { snapshotId, retainUntil: initialRetainUntil },
    });
    await prisma.moderationSnapshotEvidenceLifecycle.update({
      where: { snapshotId },
      data: { retainUntil: approvedRetainUntil },
    });

    await expect(
      prisma.moderationSnapshot.update({
        where: { id: snapshotId },
        data: { expiresAt: approvedRetainUntil },
      }),
    ).rejects.toThrow("Moderation history is immutable outside account deletion.");

    await expect(
      prisma.moderationSnapshot.findUnique({
        where: { id: snapshotId },
        select: { storageObjectKey: true, expiresAt: true },
      }),
    ).resolves.toEqual({
      storageObjectKey: `audio/${testRunId}/evidence.m4a`,
      expiresAt: new Date("2026-08-02T00:00:00.000Z"),
    });
    await expect(
      prisma.moderationSnapshotEvidenceLifecycle.findUnique({
        where: { snapshotId },
        select: { retainUntil: true, deletedAt: true },
      }),
    ).resolves.toEqual({ retainUntil: approvedRetainUntil, deletedAt: null });
  });
});
