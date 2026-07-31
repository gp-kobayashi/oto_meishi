import { beforeEach, describe, expect, it, vi } from "vitest";

const { mocks } = vi.hoisted(() => ({
  mocks: {
    authorize: vi.fn(),
    transaction: vi.fn(),
    caseFindUnique: vi.fn(),
    caseUpdate: vi.fn(),
    eventCreate: vi.fn(),
    profileUpdate: vi.fn(),
    linkUpdateMany: vi.fn(),
    actionCreate: vi.fn(),
    notificationCreate: vi.fn(),
    userRateLimit: vi.fn(),
    ipRateLimit: vi.fn(),
    getClientIp: vi.fn(),
  },
}));

vi.mock("@/lib/adminAuth", () => ({
  authorizeAdminRequest: mocks.authorize,
}));
vi.mock("@/lib/adminActionRateLimit", () => ({
  consumeAdminActionRateLimit: mocks.userRateLimit,
  consumeAdminActionIpRateLimit: mocks.ipRateLimit,
}));
vi.mock("@/lib/clientIp", () => ({ getClientIp: mocks.getClientIp }));
vi.mock("@/lib/prisma", () => ({
  prisma: { $transaction: mocks.transaction },
}));

import { PATCH } from "@/app/(site)/api/admin/moderation/cases/[caseId]/route";

const request = (body: unknown) =>
  new Request("http://localhost/api/admin/moderation/cases/case-1", {
    method: "PATCH",
    headers: {
      Authorization: "Bearer admin-token",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

const context = { params: Promise.resolve({ caseId: "case-1" }) };

const pendingCase = {
  id: "case-1",
  profileId: "profile-1",
  targetType: "socialLink",
  targetId: "link-1",
  status: "preReviewPending",
  reviewMode: "preReview",
  snapshots: [{ content: { url: "https://example.com/new" } }],
  profile: {
    status: "active",
    audioStatus: "active",
    accountModerationStatus: "active",
  },
};

describe("PATCH /api/admin/moderation/cases/[caseId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorize.mockResolvedValue({
      ok: true,
      admin: { id: "admin-1", role: "admin" },
    });
    mocks.userRateLimit.mockReturnValue({
      allowed: true,
      retryAfterSeconds: 60,
    });
    mocks.ipRateLimit.mockReturnValue({
      allowed: true,
      retryAfterSeconds: 60,
    });
    mocks.getClientIp.mockReturnValue(null);
    mocks.caseFindUnique.mockResolvedValue(pendingCase);
    mocks.actionCreate.mockResolvedValue({ id: "action-1" });
    mocks.transaction.mockImplementation((callback) =>
      callback({
        moderationCase: {
          findUnique: mocks.caseFindUnique,
          update: mocks.caseUpdate,
        },
        moderationCaseEvent: { create: mocks.eventCreate },
        profile: { update: mocks.profileUpdate },
        socialLink: { updateMany: mocks.linkUpdateMany },
        moderationAction: { create: mocks.actionCreate },
        userNotification: { create: mocks.notificationCreate },
      }),
    );
  });

  it("事前確認の修正内容を承認して再公開する", async () => {
    const response = await PATCH(
      request({ decision: "approve", reason: "修正を確認しました。" }),
      context,
    );

    expect(response.status).toBe(200);
    expect(mocks.linkUpdateMany).toHaveBeenCalledWith({
      where: { id: "link-1" },
      data: { status: "active" },
    });
    expect(mocks.caseUpdate).toHaveBeenCalledWith({
      where: { id: "case-1" },
      data: { status: "confirmed", resolvedAt: expect.any(Date) },
    });
    expect(mocks.eventCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventType: "reviewApproved",
        actorType: "admin",
        previousStatus: "preReviewPending",
        newStatus: "confirmed",
      }),
    });
    expect(mocks.notificationCreate).toHaveBeenCalled();
  });

  it("事前確認で追加修正を依頼して非公開を継続する", async () => {
    const response = await PATCH(
      request({
        decision: "requestChanges",
        reason: "リンク先をもう一度確認してください。",
      }),
      context,
    );

    expect(response.status).toBe(200);
    expect(mocks.linkUpdateMany).toHaveBeenCalledWith({
      where: { id: "link-1" },
      data: { status: "hidden" },
    });
    expect(mocks.caseUpdate).toHaveBeenCalledWith({
      where: { id: "case-1" },
      data: {
        status: "correctionRequired",
        resolvedAt: null,
        userMessage: "リンク先をもう一度確認してください。",
      },
    });
    expect(mocks.notificationCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ title: "追加の修正が必要です" }),
    });
  });

  it("事後確認で問題が残る場合はアカウントを利用停止にする", async () => {
    mocks.caseFindUnique.mockResolvedValueOnce({
      ...pendingCase,
      targetType: "audio",
      targetId: "profile-1",
      status: "postReviewPending",
      reviewMode: "postReview",
    });

    const response = await PATCH(
      request({
        decision: "continueHidden",
        reason: "不適切な音声が残っています。",
      }),
      context,
    );
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result.accountSuspended).toBe(true);
    expect(mocks.profileUpdate).toHaveBeenCalledWith({
      where: { id: "profile-1" },
      data: expect.objectContaining({
        status: "suspended",
        accountModerationStatus: "suspended",
        suspensionAppealDueAt: expect.any(Date),
      }),
    });
    expect(mocks.actionCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: "suspend" }),
      select: { id: true },
    });
  });

  it("削除済み対象の審査を完了して残存状態を解消する", async () => {
    mocks.caseFindUnique.mockResolvedValueOnce({
      ...pendingCase,
      targetType: "audio",
      targetId: "profile-1",
      status: "postReviewPending",
      reviewMode: "postReview",
      snapshots: [{ content: { deleted: true } }],
      profile: {
        ...pendingCase.profile,
        audioStatus: "removed",
      },
    });

    const response = await PATCH(
      request({ decision: "approve", reason: "削除を確認しました。" }),
      context,
    );

    expect(response.status).toBe(200);
    expect(mocks.profileUpdate).not.toHaveBeenCalled();
    expect(mocks.actionCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "remove",
        previousStatus: "removed",
        newStatus: "removed",
      }),
      select: { id: true },
    });
  });

  it("審査待ちではないケースの重複処理を拒否する", async () => {
    mocks.caseFindUnique.mockResolvedValueOnce({
      ...pendingCase,
      status: "confirmed",
    });

    const response = await PATCH(
      request({ decision: "approve", reason: "確認しました。" }),
      context,
    );

    expect(response.status).toBe(409);
    expect(mocks.caseUpdate).not.toHaveBeenCalled();
  });
});
