import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const { mocks } = vi.hoisted(() => ({
  mocks: {
    authorizeAdminRequest: vi.fn(),
    consumeAdminActionRateLimit: vi.fn(),
    consumeAdminActionIpRateLimit: vi.fn(),
    getClientIp: vi.fn(),
  },
}));

vi.mock("@/lib/adminAuth", () => ({
  authorizeAdminRequest: mocks.authorizeAdminRequest,
}));
vi.mock("@/lib/adminActionRateLimit", () => ({
  consumeAdminActionRateLimit: mocks.consumeAdminActionRateLimit,
  consumeAdminActionIpRateLimit: mocks.consumeAdminActionIpRateLimit,
}));
vi.mock("@/lib/clientIp", () => ({ getClientIp: mocks.getClientIp }));

import { PATCH } from "@/app/(site)/api/admin/moderation/cases/[caseId]/route";
import { prisma } from "@/lib/prisma";

describe("管理者ケース審査のロールバック統合テスト", () => {
  const testRunId = crypto.randomUUID();
  const testUserId = `integration-moderation-${testRunId}`;
  const testAdminAuthId = `integration-moderation-admin-${testRunId}`;
  const audioKey = `audio/${testRunId}/evidence.m4a`;
  const audioContentHash = "a".repeat(64);
  const initialSnapshotExpiresAt = new Date("2026-08-02T00:00:00.000Z");
  const initialLifecycleRetainUntil = new Date("2026-08-03T00:00:00.000Z");
  let profileId = "";
  let caseId = "";
  let snapshotId = "";
  let adminUserId = "";

  beforeAll(async () => {
    mocks.authorizeAdminRequest.mockResolvedValue({
      ok: true,
      // 空のIDで監査イベントのCHECK制約を失敗させ、途中ロールバックを検証する。
      admin: { id: "", authId: "", role: "admin" },
    });
    mocks.consumeAdminActionRateLimit.mockReturnValue({
      allowed: true,
      retryAfterSeconds: 60,
    });
    mocks.consumeAdminActionIpRateLimit.mockReturnValue({
      allowed: true,
      retryAfterSeconds: 60,
    });
    mocks.getClientIp.mockReturnValue(null);

    const adminUser = await prisma.adminUser.create({
      data: { authId: testAdminAuthId, role: "admin" },
      select: { id: true },
    });
    adminUserId = adminUser.id;

    const profile = await prisma.profile.create({
      data: {
        userId: testUserId,
        status: "active",
        displayName: "ロールバック確認用",
        bio: "統合テスト用データ",
        theme: "normal",
        audioUrl: "",
        audioKey,
        audioContentHash,
        audioTitle: "",
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
        reasonCode: "other",
        reviewMode: "preReview",
        status: "preReviewPending",
        userMessage: "確認が必要です。",
      },
      select: { id: true },
    });
    caseId = moderationCase.id;

    const snapshot = await prisma.moderationSnapshot.create({
      data: {
        moderationCaseId: caseId,
        kind: "corrected",
        content: { audioKey },
        contentHash: audioContentHash,
        storageObjectKey: audioKey,
        expiresAt: initialSnapshotExpiresAt,
      },
      select: { id: true },
    });
    snapshotId = snapshot.id;
    await prisma.moderationSnapshotEvidenceLifecycle.create({
      data: {
        snapshotId,
        retainUntil: initialLifecycleRetainUntil,
      },
    });
  });

  afterAll(async () => {
    // スナップショットは本番では不変。ローカル統合テストのUUIDデータだけを
    // 後片付けする間だけ削除防止トリガーを一時停止する。
    await prisma.$executeRawUnsafe(
      'alter table public."ModerationSnapshot" disable trigger prevent_moderation_snapshot_update_or_delete',
    );
    await prisma.$executeRawUnsafe(
      'alter table public."ModerationCaseEvent" disable trigger prevent_moderation_case_event_update_or_delete',
    );
    await prisma.$executeRawUnsafe(
      'alter table public."ModerationAction" disable trigger prevent_moderation_action_update_or_delete',
    );
    try {
      await prisma.moderationAction.deleteMany({ where: { profileId } });
      await prisma.profile.deleteMany({ where: { id: profileId } });
      await prisma.adminUser.deleteMany({ where: { id: adminUserId } });
    } finally {
      await prisma.$executeRawUnsafe(
        'alter table public."ModerationSnapshot" enable trigger prevent_moderation_snapshot_update_or_delete',
      );
      await prisma.$executeRawUnsafe(
        'alter table public."ModerationCaseEvent" enable trigger prevent_moderation_case_event_update_or_delete',
      );
      await prisma.$executeRawUnsafe(
        'alter table public."ModerationAction" enable trigger prevent_moderation_action_update_or_delete',
      );
      await prisma.$disconnect();
    }
  }, 15_000);

  it("審査途中の監査イベント保存に失敗すると公開状態・ケース状態・履歴をロールバックする", async () => {
    const response = await PATCH(
      new Request(`http://localhost/api/admin/moderation/cases/${caseId}`, {
        method: "PATCH",
        headers: {
          Authorization: "Bearer integration-admin-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          decision: "approve",
          reason: "修正内容を確認しました。",
          reviewedSnapshotId: snapshotId,
        }),
      }),
      { params: Promise.resolve({ caseId }) },
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "審査結果を保存できませんでした。",
    });

    const [
      profile,
      moderationCase,
      actionCount,
      eventCount,
      snapshot,
      evidenceLifecycle,
    ] = await Promise.all([
      prisma.profile.findUnique({
        where: { id: profileId },
        select: { audioStatus: true },
      }),
      prisma.moderationCase.findUnique({
        where: { id: caseId },
        select: { status: true, resolvedAt: true },
      }),
      prisma.moderationAction.count({ where: { profileId } }),
      prisma.moderationCaseEvent.count({ where: { moderationCaseId: caseId } }),
      prisma.moderationSnapshot.findUnique({
        where: { id: snapshotId },
        select: { expiresAt: true },
      }),
      prisma.moderationSnapshotEvidenceLifecycle.findUnique({
        where: { snapshotId },
        select: { retainUntil: true, deletedAt: true },
      }),
    ]);

    expect(profile?.audioStatus).toBe("hidden");
    expect(moderationCase).toEqual({
      status: "preReviewPending",
      resolvedAt: null,
    });
    expect(actionCount).toBe(0);
    expect(eventCount).toBe(0);
    expect(snapshot).toEqual({ expiresAt: initialSnapshotExpiresAt });
    expect(evidenceLifecycle).toEqual({
      retainUntil: initialLifecycleRetainUntil,
      deletedAt: null,
    });
  });

  it("500文字の審査理由でケース・履歴・通知を保存する", async () => {
    const reason = "あ".repeat(500);
    mocks.authorizeAdminRequest.mockResolvedValue({
      ok: true,
      admin: { id: adminUserId, authId: testAdminAuthId, role: "admin" },
    });

    const response = await PATCH(
      new Request(`http://localhost/api/admin/moderation/cases/${caseId}`, {
        method: "PATCH",
        headers: {
          Authorization: "Bearer integration-admin-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          decision: "approve",
          reason,
          reviewedSnapshotId: snapshotId,
        }),
      }),
      { params: Promise.resolve({ caseId }) },
    );

    expect(response.status).toBe(200);

    const [
      profile,
      moderationCase,
      moderationAction,
      notification,
      event,
      snapshotAfterReview,
      evidenceLifecycle,
    ] =
      await Promise.all([
        prisma.profile.findUnique({
          where: { id: profileId },
          select: { audioStatus: true },
        }),
        prisma.moderationCase.findUnique({
          where: { id: caseId },
          select: { status: true, resolvedAt: true },
        }),
        prisma.moderationAction.findFirst({
          where: { profileId },
          select: { reason: true },
        }),
        prisma.userNotification.findFirst({
          where: { profileId },
          select: { message: true },
        }),
        prisma.moderationCaseEvent.findFirst({
          where: { moderationCaseId: caseId },
          select: { eventType: true },
        }),
        prisma.moderationSnapshot.findUnique({
          where: { id: snapshotId },
          select: { storageObjectKey: true, expiresAt: true },
        }),
        prisma.moderationSnapshotEvidenceLifecycle.findUnique({
          where: { snapshotId },
          select: { retainUntil: true, deletedAt: true },
        }),
      ]);

    expect(profile?.audioStatus).toBe("active");
    expect(moderationCase).toEqual({
      status: "confirmed",
      resolvedAt: expect.any(Date),
    });
    expect(moderationAction).toEqual({ reason });
    expect(notification).toEqual({ message: reason });
    expect(event).toEqual({ eventType: "reviewApproved" });
    expect(snapshotAfterReview).toEqual({
      storageObjectKey: audioKey,
      expiresAt: initialSnapshotExpiresAt,
    });
    expect(evidenceLifecycle).toEqual({
      retainUntil: expect.any(Date),
      deletedAt: null,
    });
    expect(moderationCase?.resolvedAt).toEqual(expect.any(Date));
    expect(
      evidenceLifecycle?.retainUntil?.getTime(),
    ).toBe(
      (moderationCase?.resolvedAt?.getTime() ?? 0) +
        60 * 24 * 60 * 60 * 1000,
    );
  });
});
