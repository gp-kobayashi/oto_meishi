import { beforeEach, describe, expect, it, vi } from "vitest";

const { mocks } = vi.hoisted(() => ({
  mocks: {
    authorize: vi.fn(),
    transaction: vi.fn(),
    executeRaw: vi.fn(),
    requestFindUnique: vi.fn(),
    requestUpdate: vi.fn(),
    caseCount: vi.fn(),
    profileUpdate: vi.fn(),
    profileFindUnique: vi.fn(),
    actionCreate: vi.fn(),
    userRateLimit: vi.fn(),
    ipRateLimit: vi.fn(),
    getClientIp: vi.fn(),
  },
}));

vi.mock("@/lib/adminAuth", () => ({
  authorizeAdminRequest: mocks.authorize,
}));
vi.mock("@/lib/prisma", () => ({
  prisma: { $transaction: mocks.transaction },
}));
vi.mock("@/lib/adminActionRateLimit", () => ({
  consumeAdminActionRateLimit: mocks.userRateLimit,
  consumeAdminActionIpRateLimit: mocks.ipRateLimit,
}));
vi.mock("@/lib/clientIp", () => ({ getClientIp: mocks.getClientIp }));

import { PATCH } from "@/app/(site)/api/admin/moderation/requests/[requestId]/route";

const request = (body: unknown) =>
  new Request("http://localhost/api/admin/moderation/requests/request-1", {
    method: "PATCH",
    headers: {
      Authorization: "Bearer admin-token",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

describe("PATCH /api/admin/moderation/requests/[requestId]", () => {
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
    mocks.executeRaw.mockResolvedValue(1);
    mocks.transaction.mockImplementation((callback) =>
      callback({
        $executeRawUnsafe: mocks.executeRaw,
        moderationRequest: {
          findUnique: mocks.requestFindUnique,
          update: mocks.requestUpdate,
        },
        moderationCase: { count: mocks.caseCount },
        profile: {
          findUnique: mocks.profileFindUnique,
          update: mocks.profileUpdate,
        },
        moderationAction: { create: mocks.actionCreate },
      }),
    );
    mocks.requestFindUnique.mockResolvedValue({
      id: "request-1",
      profileId: "profile-1",
      kind: "accountAppeal",
      status: "pending",
      profile: {
        status: "suspended",
        accountModerationStatus: "suspended",
      },
    });
    mocks.requestUpdate.mockResolvedValue({});
    mocks.caseCount.mockResolvedValue(0);
    mocks.profileUpdate.mockResolvedValue({});
    mocks.profileFindUnique.mockResolvedValue({
      status: "suspended",
      accountModerationStatus: "suspended",
    });
    mocks.actionCreate.mockResolvedValue({});
  });

  it("解除申請を承認するとアカウントを復旧する", async () => {
    const response = await PATCH(
      request({
        status: "resolved",
        responseMessage: "修正内容を確認したため解除しました。",
      }),
      { params: Promise.resolve({ requestId: "request-1" }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.requestUpdate).toHaveBeenCalledWith({
      where: { id: "request-1" },
      data: {
        status: "resolved",
        responseMessage: "修正内容を確認したため解除しました。",
        resolvedAt: expect.any(Date),
      },
    });
    expect(mocks.profileUpdate).toHaveBeenCalledWith({
      where: { id: "profile-1" },
      data: {
        status: "active",
        accountModerationStatus: "active",
        suspensionAppealDueAt: null,
      },
    });
    expect(mocks.actionCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        adminUserId: "admin-1",
        action: "restore",
        previousStatus: "suspended",
        newStatus: "active",
      }),
    });
    expect(mocks.executeRaw.mock.calls).toEqual([
      [
        "select pg_advisory_xact_lock(hashtextextended($1, 0))",
        "profile:profile-1",
      ],
      [
        "select pg_advisory_xact_lock(hashtextextended($1, 0))",
        "moderation-request:request-1",
      ],
    ]);
    expect(mocks.requestFindUnique).toHaveBeenCalledTimes(2);
    expect(mocks.profileFindUnique).toHaveBeenCalledWith({
      where: { id: "profile-1" },
      select: { status: true, accountModerationStatus: true },
    });
  });

  it("解除申請を却下した場合は利用停止を維持する", async () => {
    const response = await PATCH(
      request({
        status: "rejected",
        responseMessage: "問題箇所の修正を確認できませんでした。",
      }),
      { params: Promise.resolve({ requestId: "request-1" }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.profileUpdate).not.toHaveBeenCalled();
    expect(mocks.actionCreate).not.toHaveBeenCalled();
  });

  it("未完了ケースがある解除申請の承認を拒否する", async () => {
    mocks.caseCount.mockResolvedValueOnce(1);

    const response = await PATCH(
      request({
        status: "resolved",
        responseMessage: "修正内容を確認したため解除しました。",
      }),
      { params: Promise.resolve({ requestId: "request-1" }) },
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "未完了のモデレーションケースがあるため解除できません。",
    });
    expect(mocks.caseCount).toHaveBeenCalledWith({
      where: {
        profileId: "profile-1",
        status: {
          in: ["correctionRequired", "postReviewPending", "preReviewPending"],
        },
      },
    });
    expect(mocks.requestUpdate).not.toHaveBeenCalled();
    expect(mocks.profileUpdate).not.toHaveBeenCalled();
    expect(mocks.actionCreate).not.toHaveBeenCalled();
  });

  it("対応済み申請への再回答を拒否する", async () => {
    mocks.requestFindUnique.mockResolvedValueOnce({
      id: "request-1",
      profileId: "profile-1",
      kind: "inquiry",
      status: "resolved",
      profile: {
        status: "active",
        accountModerationStatus: "active",
      },
    });

    const response = await PATCH(
      request({
        status: "resolved",
        responseMessage: "回答です。",
      }),
      { params: Promise.resolve({ requestId: "request-1" }) },
    );

    expect(response.status).toBe(409);
    expect(mocks.requestUpdate).not.toHaveBeenCalled();
  });
});
