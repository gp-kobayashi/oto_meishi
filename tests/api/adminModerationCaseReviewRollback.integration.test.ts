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
  let profileId = "";
  let caseId = "";
  let snapshotId = "";

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

    const profile = await prisma.profile.create({
      data: {
        userId: testUserId,
        status: "hidden",
        displayName: "ロールバック確認用",
        bio: "統合テスト用データ",
        theme: "normal",
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
        content: {
          displayName: "ロールバック確認用",
          bio: "統合テスト用データ",
          theme: "normal",
        },
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
      select: { id: true },
    });
    snapshotId = snapshot.id;
  });

  afterAll(async () => {
    // スナップショットは本番では不変。ローカル統合テストのUUIDデータだけを
    // 後片付けする間だけ削除防止トリガーを一時停止する。
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

    const [profile, moderationCase, actionCount, eventCount] = await Promise.all([
      prisma.profile.findUnique({
        where: { id: profileId },
        select: { status: true },
      }),
      prisma.moderationCase.findUnique({
        where: { id: caseId },
        select: { status: true, resolvedAt: true },
      }),
      prisma.moderationAction.count({ where: { profileId } }),
      prisma.moderationCaseEvent.count({ where: { moderationCaseId: caseId } }),
    ]);

    expect(profile?.status).toBe("hidden");
    expect(moderationCase).toEqual({
      status: "preReviewPending",
      resolvedAt: null,
    });
    expect(actionCount).toBe(0);
    expect(eventCount).toBe(0);
  });
});
