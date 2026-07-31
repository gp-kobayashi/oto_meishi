import { beforeEach, describe, expect, it, vi } from "vitest";

const { mocks } = vi.hoisted(() => ({
  mocks: {
    authorize: vi.fn(),
    transaction: vi.fn(),
    requestFindUnique: vi.fn(),
    requestUpdate: vi.fn(),
    profileUpdate: vi.fn(),
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
    mocks.transaction.mockImplementation((callback) =>
      callback({
        moderationRequest: {
          findUnique: mocks.requestFindUnique,
          update: mocks.requestUpdate,
        },
        profile: { update: mocks.profileUpdate },
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
    mocks.profileUpdate.mockResolvedValue({});
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
