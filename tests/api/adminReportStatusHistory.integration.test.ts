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

import { PATCH } from "@/app/(site)/api/admin/reports/[reportId]/route";
import { prisma } from "@/lib/prisma";

describe("通報状態と対応履歴のトランザクション統合テスト", () => {
  const testRunId = crypto.randomUUID();
  const testUserId = `integration-report-history-${testRunId}`;
  const testAdminAuthId = `integration-report-admin-${testRunId}`;
  let profileId = "";
  let adminUserId = "";
  let successReportId = "";
  let rollbackReportId = "";
  let protectedReportId = "";

  const request = (reportId: string, note: string) =>
    PATCH(
      new Request(`http://localhost/api/admin/reports/${reportId}`, {
        method: "PATCH",
        headers: {
          Authorization: "Bearer integration-admin-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status: "reviewed", note }),
      }),
      { params: Promise.resolve({ reportId }) },
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

    const profile = await prisma.profile.create({
      data: {
        userId: testUserId,
        displayName: "通報履歴確認用",
        bio: "統合テスト用データ",
        theme: "normal",
        audioUrl: "",
        audioTitle: "",
      },
      select: { id: true },
    });
    profileId = profile.id;

    const reports = await Promise.all(
      ["success", "rollback", "protected"].map((label) =>
        prisma.contentReport.create({
          data: {
            profileId,
            targetType: "profile",
            targetId: profileId,
            targetSnapshot: { legacy: false, status: "active" },
            reason: "other",
            details: `統合テスト: ${label}`,
          },
          select: { id: true },
        }),
      ),
    );
    successReportId = reports[0].id;
    rollbackReportId = reports[1].id;
    protectedReportId = reports[2].id;
  });

  afterAll(async () => {
    // 対応履歴は本番では不変。このテストデータの後片付け中だけ
    // 削除防止トリガーを停止する。
    await prisma.$executeRawUnsafe(
      'alter table public."ContentReportStatusEvent" disable trigger prevent_content_report_status_event_update_or_delete',
    );
    try {
      await prisma.profile.deleteMany({ where: { id: profileId } });
      await prisma.adminUser.deleteMany({ where: { id: adminUserId } });
    } finally {
      await prisma.$executeRawUnsafe(
        'alter table public."ContentReportStatusEvent" enable trigger prevent_content_report_status_event_update_or_delete',
      );
      await prisma.$disconnect();
    }
  }, 15_000);

  it("通報状態と対応履歴を同時に保存する", async () => {
    mocks.authorizeAdminRequest.mockResolvedValue({
      ok: true,
      admin: { id: adminUserId, authId: testAdminAuthId, role: "admin" },
    });

    const note = "通報内容を確認しました。";
    const response = await request(successReportId, note);

    expect(response.status).toBe(200);

    const [report, events] = await Promise.all([
      prisma.contentReport.findUnique({
        where: { id: successReportId },
        select: {
          status: true,
          reviewedByAdminUserId: true,
          reviewedAt: true,
          reviewNote: true,
        },
      }),
      prisma.contentReportStatusEvent.findMany({
        where: { reportId: successReportId },
        select: {
          adminUserId: true,
          adminAuthId: true,
          previousStatus: true,
          newStatus: true,
          note: true,
          createdAt: true,
        },
      }),
    ]);

    expect(report).toEqual({
      status: "reviewed",
      reviewedByAdminUserId: adminUserId,
      reviewedAt: expect.any(Date),
      reviewNote: note,
    });
    expect(events).toEqual([
      {
        adminUserId,
        adminAuthId: testAdminAuthId,
        previousStatus: "pending",
        newStatus: "reviewed",
        note,
        createdAt: report?.reviewedAt,
      },
    ]);
  });

  it("履歴の保存に失敗すると通報状態の更新もロールバックする", async () => {
    mocks.authorizeAdminRequest.mockResolvedValue({
      ok: true,
      admin: {
        id: adminUserId,
        // 履歴カラムのvarchar(128)を超えて、履歴追加だけを失敗させる。
        authId: "a".repeat(129),
        role: "admin",
      },
    });

    const response = await request(rollbackReportId, "ロールバック確認");

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "通報状態を変更できませんでした。",
    });

    const [report, eventCount] = await Promise.all([
      prisma.contentReport.findUnique({
        where: { id: rollbackReportId },
        select: {
          status: true,
          reviewedByAdminUserId: true,
          reviewedAt: true,
          reviewNote: true,
        },
      }),
      prisma.contentReportStatusEvent.count({
        where: { reportId: rollbackReportId },
      }),
    ]);

    expect(report).toEqual({
      status: "pending",
      reviewedByAdminUserId: null,
      reviewedAt: null,
      reviewNote: "",
    });
    expect(eventCount).toBe(0);
  });

  it("終了済み通報をDBの直接更新でも再オープンできない", async () => {
    await prisma.contentReport.update({
      where: { id: protectedReportId },
      data: { status: "resolved" },
    });

    await expect(
      prisma.contentReport.update({
        where: { id: protectedReportId },
        data: { status: "reviewed" },
      }),
    ).rejects.toThrow("Invalid ContentReport status transition");

    await expect(
      prisma.contentReport.findUnique({
        where: { id: protectedReportId },
        select: { status: true },
      }),
    ).resolves.toEqual({ status: "resolved" });
  });
});
