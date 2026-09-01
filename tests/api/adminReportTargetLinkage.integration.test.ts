import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const { mocks } = vi.hoisted(() => ({
  mocks: {
    consumeReportIpRateLimit: vi.fn(),
    consumeReportTargetRateLimit: vi.fn(),
    authorizeAdminRequest: vi.fn(),
    consumeAdminActionRateLimit: vi.fn(),
    consumeAdminActionIpRateLimit: vi.fn(),
    getClientIp: vi.fn(),
  },
}));

vi.mock("@/lib/reportRateLimit", () => ({
  consumeReportIpRateLimit: mocks.consumeReportIpRateLimit,
  consumeReportTargetRateLimit: mocks.consumeReportTargetRateLimit,
}));
vi.mock("@/lib/adminAuth", () => ({
  authorizeAdminRequest: mocks.authorizeAdminRequest,
}));
vi.mock("@/lib/adminActionRateLimit", () => ({
  consumeAdminActionRateLimit: mocks.consumeAdminActionRateLimit,
  consumeAdminActionIpRateLimit: mocks.consumeAdminActionIpRateLimit,
}));
vi.mock("@/lib/clientIp", () => ({ getClientIp: mocks.getClientIp }));

import { POST as createReport } from "@/app/(site)/api/reports/route";
import { PATCH as moderate } from "@/app/(site)/api/admin/moderation/actions/route";
import { prisma } from "@/lib/prisma";

describe("通報対象と管理ケースの実DB関連付け", () => {
  const runId = crypto.randomUUID();
  let profileId = "";
  let adminUserId = "";
  let linkAId = "";
  let linkBId = "";

  const allowed = { allowed: true, limit: 100, remaining: 99 };

  beforeAll(async () => {
    mocks.consumeReportIpRateLimit.mockReturnValue(allowed);
    mocks.consumeReportTargetRateLimit.mockReturnValue(allowed);
    mocks.consumeAdminActionRateLimit.mockReturnValue(allowed);
    mocks.consumeAdminActionIpRateLimit.mockReturnValue(allowed);
    mocks.getClientIp.mockReturnValue(`integration-${runId}`);

    const admin = await prisma.adminUser.create({
      data: { authId: `report-link-admin-${runId}`, role: "admin" },
      select: { id: true },
    });
    adminUserId = admin.id;
    mocks.authorizeAdminRequest.mockResolvedValue({
      ok: true,
      admin: {
        id: adminUserId,
        authId: `report-link-admin-${runId}`,
        role: "admin",
      },
    });

    const profile = await prisma.profile.create({
      data: {
        userId: `report-link-profile-${runId}`,
        displayName: "通報対象リンク確認用",
        bio: "統合テスト用プロフィール",
        theme: "normal",
        audioUrl: "",
        audioTitle: "",
        sns: {
          create: [
            {
              service: "youtube",
              label: "リンクA",
              url: "https://youtube.com/a",
              sortOrder: 0,
            },
            {
              service: "x",
              label: "リンクB",
              url: "https://x.com/b",
              sortOrder: 1,
            },
          ],
        },
      },
      select: { id: true, sns: { select: { id: true, label: true } } },
    });
    profileId = profile.id;
    linkAId = profile.sns.find((link) => link.label === "リンクA")!.id;
    linkBId = profile.sns.find((link) => link.label === "リンクB")!.id;
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
  });

  const report = (targetId: string, details: string) =>
    createReport(
      new Request("http://localhost/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profileId,
          reason: "unsafe_link",
          details,
          targetType: "socialLink",
          targetId,
        }),
      }),
    );

  it("リンク別のスナップショットを保存し、Aの通報だけをケースへ関連付ける", async () => {
    expect((await report(linkAId, "Aの通報1")).status).toBe(201);
    expect((await report(linkAId, "Aの通報2")).status).toBe(201);
    expect((await report(linkBId, "Bの通報")).status).toBe(201);

    const before = await prisma.contentReport.findMany({
      where: { profileId },
      orderBy: { createdAt: "asc" },
      select: {
        details: true,
        targetType: true,
        targetId: true,
        targetSnapshot: true,
      },
    });
    expect(before).toHaveLength(3);
    const reportsForA = before.filter((entry) =>
      entry.details.startsWith("Aの"),
    );
    const reportsForB = before.filter((entry) => entry.details === "Bの通報");
    expect(reportsForA).toHaveLength(2);
    expect(reportsForA).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          targetType: "socialLink",
          targetId: linkAId,
          targetSnapshot: expect.objectContaining({ label: "リンクA" }),
        }),
        expect.objectContaining({
          targetType: "socialLink",
          targetId: linkAId,
          targetSnapshot: expect.objectContaining({ label: "リンクA" }),
        }),
      ]),
    );
    expect(reportsForB).toHaveLength(1);
    expect(reportsForB[0]).toMatchObject({
      targetType: "socialLink",
      targetId: linkBId,
      targetSnapshot: expect.objectContaining({ label: "リンクB" }),
    });

    const response = await moderate(
      new Request("http://localhost/api/admin/moderation/actions", {
        method: "PATCH",
        headers: {
          Authorization: "Bearer integration-admin-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          targetType: "socialLink",
          targetId: linkAId,
          action: "hide",
          reason: "リンクAを確認しました",
          reasonCode: "unsafeLink",
        }),
      }),
    );
    expect(response.status).toBe(200);

    const [links, reports, cases, actions] = await Promise.all([
      prisma.socialLink.findMany({
        where: { id: { in: [linkAId, linkBId] } },
        select: { id: true, status: true },
      }),
      prisma.contentReport.findMany({
        where: { profileId },
        orderBy: { createdAt: "asc" },
        select: {
          details: true,
          targetId: true,
          moderationCaseId: true,
          moderationActionId: true,
        },
      }),
      prisma.moderationCase.findMany({
        where: { profileId, targetId: linkAId },
        select: { id: true, targetType: true, targetId: true },
      }),
      prisma.moderationAction.findMany({
        where: { profileId, targetId: linkAId },
        select: { id: true, targetType: true, targetId: true },
      }),
    ]);
    expect(links).toEqual(
      expect.arrayContaining([
        { id: linkAId, status: "hidden" },
        { id: linkBId, status: "active" },
      ]),
    );
    expect(cases).toHaveLength(1);
    expect(actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          targetType: "socialLink",
          targetId: linkAId,
        }),
      ]),
    );
    const linkedAReports = reports.filter((report) =>
      report.details.startsWith("Aの"),
    );
    const unlinkedBReports = reports.filter(
      (report) => report.details === "Bの通報",
    );
    expect(linkedAReports).toHaveLength(2);
    expect(linkedAReports).toEqual([
      expect.objectContaining({
        targetId: linkAId,
        moderationCaseId: cases[0].id,
        moderationActionId: actions.find(
          (action) => action.targetType === "socialLink",
        )!.id,
      }),
      expect.objectContaining({
        targetId: linkAId,
        moderationCaseId: cases[0].id,
        moderationActionId: actions.find(
          (action) => action.targetType === "socialLink",
        )!.id,
      }),
    ]);
    expect(unlinkedBReports).toHaveLength(1);
    expect(unlinkedBReports[0]).toMatchObject({
      targetId: linkBId,
      moderationCaseId: null,
      moderationActionId: null,
    });
  });
});
