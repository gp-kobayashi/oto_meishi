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

import { GET as getModerationList } from "@/app/(site)/api/admin/moderation/route";
import { PATCH as updateReport } from "@/app/(site)/api/admin/reports/[reportId]/route";
import { prisma } from "@/lib/prisma";
import { getModerationFilterWhere } from "@/lib/adminModeration";

describe("要対応通報の管理一覧統合テスト", () => {
  const runId = crypto.randomUUID();
  let profileId = "";
  let reportId = "";
  let dismissedReportId = "";
  let adminUserId = "";
  let baselineAttentionTotal = 0;

  beforeAll(async () => {
    const admin = await prisma.adminUser.create({
      data: { authId: `report-list-admin-${runId}`, role: "admin" },
      select: { id: true },
    });
    adminUserId = admin.id;
    mocks.authorizeAdminRequest.mockResolvedValue({
      ok: true,
      admin: {
        id: adminUserId,
        authId: `report-list-admin-${runId}`,
        role: "admin",
      },
    });
    mocks.consumeAdminActionRateLimit.mockReturnValue({ allowed: true });
    mocks.consumeAdminActionIpRateLimit.mockReturnValue({ allowed: true });
    mocks.getClientIp.mockReturnValue(null);
    baselineAttentionTotal = await prisma.profile.count({
      where: getModerationFilterWhere("attention"),
    });

    const profile = await prisma.profile.create({
      data: {
        userId: `report-list-profile-${runId}`,
        displayName: "要対応通報一覧確認用",
        bio: "統合テスト用",
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
        status: "confirmed",
        resolvedAt: new Date(),
        userMessage: "統合テスト用ケース",
      },
      select: { id: true },
    });
    const moderationAction = await prisma.moderationAction.create({
      data: {
        adminUserId,
        profileId,
        targetType: "profile",
        targetId: profileId,
        action: "hide",
        previousStatus: "active",
        newStatus: "hidden",
        reason: "統合テスト用操作",
      },
      select: { id: true },
    });
    const report = await prisma.contentReport.create({
      data: {
        profileId,
        targetType: "profile",
        targetId: profileId,
        targetSnapshot: {
          source: "integration",
          displayName: "要対応通報一覧確認用",
        },
        reason: "other",
        details: `統合テスト-${runId}`,
        moderationCaseId: moderationCase.id,
        moderationActionId: moderationAction.id,
      },
      select: { id: true },
    });
    reportId = report.id;
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

  const list = () =>
    getModerationList(
      new Request(
        `http://localhost/api/admin/moderation?filter=attention&q=report-list-profile-${runId}`,
      ),
    );
  const patchReport = (
    status: "reviewed" | "resolved" | "dismissed",
    targetReportId = reportId,
  ) =>
    updateReport(
      new Request(`http://localhost/api/admin/reports/${targetReportId}`, {
        method: "PATCH",
        headers: {
          Authorization: "Bearer integration-admin-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status, note: `統合テスト-${status}` }),
      }),
      { params: Promise.resolve({ reportId: targetReportId }) },
    );

  it("pending/reviewedは要対応、resolvedは要対応外になる", async () => {
    const pendingResponse = await list();
    const pending = await pendingResponse.json();
    expect(pendingResponse.status).toBe(200);
    expect(pending.attentionTotal).toBe(baselineAttentionTotal + 1);
    expect(pending.pagination.total).toBe(1);
    expect(pending.items[0]).toMatchObject({
      id: profileId,
      pendingReportCount: 1,
    });

    expect((await patchReport("reviewed")).status).toBe(200);
    const reviewedResponse = await list();
    const reviewed = await reviewedResponse.json();
    expect(reviewed.attentionTotal).toBe(baselineAttentionTotal + 1);
    expect(reviewed.pagination.total).toBe(1);
    expect(reviewed.items[0].pendingReportCount).toBe(1);

    expect((await patchReport("resolved")).status).toBe(200);
    const resolvedResponse = await list();
    const resolved = await resolvedResponse.json();
    expect(resolved.attentionTotal).toBe(baselineAttentionTotal);
    expect(resolved.pagination.total).toBe(0);
    expect(resolved.items).toEqual([]);

    const dismissedReport = await prisma.contentReport.create({
      data: {
        profileId,
        targetType: "profile",
        targetId: profileId,
        targetSnapshot: {
          source: "integration",
          displayName: "要対応通報一覧確認用",
        },
        reason: "other",
        details: `統合テスト-dismissed-${runId}`,
      },
      select: { id: true },
    });
    dismissedReportId = dismissedReport.id;
    expect((await patchReport("dismissed", dismissedReportId)).status).toBe(
      200,
    );
    const dismissedResponse = await list();
    const dismissed = await dismissedResponse.json();
    expect(dismissed.attentionTotal).toBe(baselineAttentionTotal);
    expect(dismissed.pagination.total).toBe(0);
  });
});
