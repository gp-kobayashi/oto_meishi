import { beforeEach, describe, expect, it, vi } from "vitest";

const { mocks } = vi.hoisted(() => ({
  mocks: {
    authorizeAdminRequest: vi.fn(),
    consumeAdminActionRateLimit: vi.fn(),
    consumeAdminActionIpRateLimit: vi.fn(),
    getClientIp: vi.fn(),
    transaction: vi.fn(),
    findUnique: vi.fn(),
    updateMany: vi.fn(),
    eventCreate: vi.fn(),
    lockModerationProfile: vi.fn(),
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
vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: mocks.transaction,
  },
}));
vi.mock("@/lib/moderationTransactionLock", () => ({
  lockModerationProfile: mocks.lockModerationProfile,
}));

import { PATCH } from "@/app/(site)/api/admin/reports/[reportId]/route";

const request = (body: unknown) =>
  new Request("http://localhost/api/admin/reports/report-1", {
    method: "PATCH",
    headers: {
      Authorization: "Bearer valid-token",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
const context = (reportId = "report-1") => ({
  params: Promise.resolve({ reportId }),
});

describe("PATCH /api/admin/reports/[reportId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorizeAdminRequest.mockResolvedValue({
      ok: true,
      admin: { id: "admin-1", authId: "auth-1", role: "admin" },
    });
    mocks.consumeAdminActionRateLimit.mockReturnValue({ allowed: true });
    mocks.consumeAdminActionIpRateLimit.mockReturnValue({ allowed: true });
    mocks.getClientIp.mockReturnValue("127.0.0.1");
    mocks.findUnique.mockResolvedValue({
      id: "report-1",
      profileId: "profile-1",
      status: "pending",
      moderationCaseId: "case-1",
      moderationActionId: "action-1",
    });
    mocks.lockModerationProfile.mockResolvedValue(undefined);
    mocks.updateMany.mockResolvedValue({ count: 1 });
    mocks.eventCreate.mockResolvedValue({ id: "event-1" });
    mocks.transaction.mockImplementation(async (callback) =>
      callback({
        contentReport: {
          findUnique: mocks.findUnique,
          updateMany: mocks.updateMany,
        },
        contentReportStatusEvent: { create: mocks.eventCreate },
      }),
    );
  });

  it("管理者が通報状態を変更できる", async () => {
    const response = await PATCH(
      request({ status: "reviewed", note: "内容を確認しました" }),
      context(),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { id: "report-1", status: "pending" },
      data: {
        status: "reviewed",
        reviewedByAdminUserId: "admin-1",
        reviewedAt: expect.any(Date),
        reviewNote: "内容を確認しました",
      },
    });
    expect(mocks.eventCreate).toHaveBeenCalledWith({
      data: {
        reportId: "report-1",
        adminUserId: "admin-1",
        adminAuthId: "auth-1",
        adminRole: "admin",
        previousStatus: "pending",
        newStatus: "reviewed",
        note: "内容を確認しました",
        createdAt: expect.any(Date),
      },
      select: { id: true },
    });
    expect(mocks.eventCreate.mock.calls[0][0].data.createdAt).toBe(
      mocks.updateMany.mock.calls[0][0].data.reviewedAt,
    );
  });

  it("確認済みの通報を対応完了へ進められる", async () => {
    mocks.findUnique.mockResolvedValueOnce({
      id: "report-1",
      profileId: "profile-1",
    });
    mocks.findUnique.mockResolvedValueOnce({
      id: "report-1",
      profileId: "profile-1",
      status: "reviewed",
      moderationCaseId: "case-1",
      moderationActionId: "action-1",
    });

    const response = await PATCH(
      request({ status: "resolved", note: "違反対応が完了しました" }),
      context(),
    );

    expect(response.status).toBe(200);
    expect(mocks.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "resolved" }),
      }),
    );
  });

  it("ケースと操作履歴に未関連の通報は対応完了にできない", async () => {
    mocks.findUnique.mockResolvedValueOnce({
      id: "report-1",
      profileId: "profile-1",
    });
    mocks.findUnique.mockResolvedValueOnce({
      id: "report-1",
      profileId: "profile-1",
      status: "reviewed",
      moderationCaseId: null,
      moderationActionId: null,
    });

    const response = await PATCH(
      request({ status: "resolved", note: "対応完了" }),
      context(),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error:
        "先に通報対象への対応を行い、ケースと管理操作履歴を関連付けてください。",
    });
    expect(mocks.updateMany).not.toHaveBeenCalled();
    expect(mocks.eventCreate).not.toHaveBeenCalled();
  });

  it.each(["resolved", "dismissed"] as const)(
    "終了済み状態%sからの再変更を拒否する",
    async (currentStatus) => {
      mocks.findUnique.mockResolvedValueOnce({
        id: "report-1",
        profileId: "profile-1",
      });
      mocks.findUnique.mockResolvedValueOnce({
        id: "report-1",
        profileId: "profile-1",
        status: currentStatus,
        moderationCaseId: "case-1",
        moderationActionId: "action-1",
      });

      const response = await PATCH(
        request({ status: "reviewed", note: "再確認します" }),
        context(),
      );

      expect(response.status).toBe(409);
      await expect(response.json()).resolves.toEqual({
        error: "完了した通報の状態は変更できません。",
      });
      expect(mocks.updateMany).not.toHaveBeenCalled();
    },
  );

  it("同時操作で状態が変わった場合は履歴を追加せず再読み込みを求める", async () => {
    mocks.updateMany.mockResolvedValueOnce({ count: 0 });

    const response = await PATCH(
      request({ status: "reviewed", note: "内容を確認しました" }),
      context(),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "通報状態が更新されています。再読み込みしてください。",
    });
    expect(mocks.eventCreate).not.toHaveBeenCalled();
  });

  it("許可されていない状態は拒否する", async () => {
    const response = await PATCH(
      request({ status: "pending", note: "確認" }),
      context(),
    );

    expect(response.status).toBe(400);
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it("権限がなければDBへ問い合わせない", async () => {
    mocks.authorizeAdminRequest.mockResolvedValue({
      ok: false,
      response: Response.json({ error: "権限なし" }, { status: 403 }),
    });

    const response = await PATCH(
      request({ status: "resolved", note: "対応完了" }),
      context(),
    );

    expect(response.status).toBe(403);
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });

  it("対応メモが空の場合は拒否する", async () => {
    const response = await PATCH(
      request({ status: "reviewed", note: "" }),
      context(),
    );

    expect(response.status).toBe(400);
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });
});
