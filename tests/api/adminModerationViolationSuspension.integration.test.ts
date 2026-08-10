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

import { PATCH } from "@/app/(site)/api/admin/moderation/actions/route";
import { prisma } from "@/lib/prisma";

describe("違反回数による利用停止の統合テスト", () => {
  const testRunId = crypto.randomUUID();
  const testAdminAuthId = `integration-violation-admin-${testRunId}`;
  const profileIds: string[] = [];
  let adminUserId = "";
  let repeatedViolationProfileId = "";
  let rollbackProfileId = "";

  const request = (
    profileId: string,
    reasonCode: "harassment" | "impersonation",
  ) =>
    PATCH(
      new Request("http://localhost/api/admin/moderation/actions", {
        method: "PATCH",
        headers: {
          Authorization: "Bearer integration-admin-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          targetType: "profile",
          targetId: profileId,
          action: "hide",
          reason: "統合テストで違反を確定しました。",
          reasonCode,
        }),
      }),
    );

  beforeAll(async () => {
    mocks.consumeAdminActionRateLimit.mockReturnValue({ allowed: true });
    mocks.consumeAdminActionIpRateLimit.mockReturnValue({ allowed: true });
    mocks.getClientIp.mockReturnValue(null);

    const adminUser = await prisma.adminUser.create({
      data: { authId: testAdminAuthId, role: "admin" },
      select: { id: true },
    });
    adminUserId = adminUser.id;

    const profiles = await Promise.all(
      ["repeated", "rollback"].map((label) =>
        prisma.profile.create({
          data: {
            userId: `integration-violation-${label}-${testRunId}`,
            displayName: `違反回数確認用 ${label}`,
            bio: "統合テスト用データ",
            theme: "normal",
            audioUrl: "",
            audioTitle: "",
          },
          select: { id: true },
        }),
      ),
    );
    repeatedViolationProfileId = profiles[0].id;
    rollbackProfileId = profiles[1].id;
    profileIds.push(repeatedViolationProfileId, rollbackProfileId);

    const previousCase = await prisma.moderationCase.create({
      data: {
        profileId: repeatedViolationProfileId,
        targetType: "profile",
        targetId: repeatedViolationProfileId,
        reasonCode: "harassment",
        reviewMode: "preReview",
        status: "confirmed",
        userMessage: "過去の誚謗中傷違反",
        resolvedAt: new Date(),
      },
      select: { id: true },
    });
    await prisma.moderationViolationEvent.create({
      data: {
        profileId: repeatedViolationProfileId,
        moderationCaseId: previousCase.id,
        adminUserId,
        adminAuthId: testAdminAuthId,
        adminRole: "admin",
        eventType: "confirmed",
        reasonCode: "harassment",
        note: "1回目の誚謗中傷違反",
      },
    });
  });

  afterAll(async () => {
    try {
      await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`select set_config('app.account_deletion', 'enabled', true)`;
        await tx.moderationAction.deleteMany({
          where: { profileId: { in: profileIds } },
        });
        await tx.profile.deleteMany({ where: { id: { in: profileIds } } });
        await tx.adminUser.deleteMany({ where: { id: adminUserId } });
      });
    } finally {
      await prisma.$disconnect();
    }
  }, 15_000);

  it("同種の違反2回目でアカウント・履歴・通知を同時に保存する", async () => {
    mocks.authorizeAdminRequest.mockResolvedValue({
      ok: true,
      admin: { id: adminUserId, authId: testAdminAuthId, role: "admin" },
    });

    const response = await request(repeatedViolationProfileId, "harassment");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      newStatus: "suspended",
      accountSuspended: true,
    });

    const [profile, violations, action, notification] = await Promise.all([
      prisma.profile.findUnique({
        where: { id: repeatedViolationProfileId },
        select: {
          status: true,
          accountModerationStatus: true,
          suspensionAppealDueAt: true,
        },
      }),
      prisma.moderationViolationEvent.findMany({
        where: {
          profileId: repeatedViolationProfileId,
          eventType: "confirmed",
        },
        orderBy: { createdAt: "asc" },
        select: { reasonCode: true, suspensionTriggered: true },
      }),
      prisma.moderationAction.findFirst({
        where: { profileId: repeatedViolationProfileId },
        select: { action: true, newStatus: true },
      }),
      prisma.userNotification.findFirst({
        where: { profileId: repeatedViolationProfileId },
        select: { title: true },
      }),
    ]);

    expect(profile).toEqual({
      status: "suspended",
      accountModerationStatus: "suspended",
      suspensionAppealDueAt: expect.any(Date),
    });
    expect(violations).toEqual([
      { reasonCode: "harassment", suspensionTriggered: false },
      { reasonCode: "harassment", suspensionTriggered: true },
    ]);
    expect(action).toEqual({ action: "suspend", newStatus: "suspended" });
    expect(notification).toEqual({ title: "プロフィールの利用停止について" });
  });

  it("違反履歴の保存に失敗すると利用停止と関連履歴をロールバックする", async () => {
    mocks.authorizeAdminRequest.mockResolvedValue({
      ok: true,
      admin: {
        id: adminUserId,
        authId: "a".repeat(129),
        role: "admin",
      },
    });

    const response = await request(rollbackProfileId, "impersonation");

    expect(response.status).toBe(500);

    const [profile, caseCount, violationCount, actionCount, notificationCount] =
      await Promise.all([
        prisma.profile.findUnique({
          where: { id: rollbackProfileId },
          select: { status: true, accountModerationStatus: true },
        }),
        prisma.moderationCase.count({
          where: { profileId: rollbackProfileId },
        }),
        prisma.moderationViolationEvent.count({
          where: { profileId: rollbackProfileId },
        }),
        prisma.moderationAction.count({
          where: { profileId: rollbackProfileId },
        }),
        prisma.userNotification.count({
          where: { profileId: rollbackProfileId },
        }),
      ]);

    expect(profile).toEqual({
      status: "active",
      accountModerationStatus: "active",
    });
    expect(caseCount).toBe(0);
    expect(violationCount).toBe(0);
    expect(actionCount).toBe(0);
    expect(notificationCount).toBe(0);
  });
});
