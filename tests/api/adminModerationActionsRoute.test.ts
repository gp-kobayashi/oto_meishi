import { beforeEach, describe, expect, it, vi } from "vitest";

const { mocks } = vi.hoisted(() => ({
  mocks: {
    authorizeAdminRequest: vi.fn(),
    transaction: vi.fn(),
    profileFindUnique: vi.fn(),
    profileUpdate: vi.fn(),
    socialLinkFindUnique: vi.fn(),
    socialLinkUpdate: vi.fn(),
    actionCreate: vi.fn(),
  },
}));

vi.mock("@/lib/adminAuth", () => ({
  authorizeAdminRequest: mocks.authorizeAdminRequest,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: { $transaction: mocks.transaction },
}));

import { PATCH } from "@/app/(site)/api/admin/moderation/actions/route";

const tx = {
  profile: { findUnique: mocks.profileFindUnique, update: mocks.profileUpdate },
  socialLink: {
    findUnique: mocks.socialLinkFindUnique,
    update: mocks.socialLinkUpdate,
  },
  moderationAction: { create: mocks.actionCreate },
};

const request = (body: unknown) =>
  new Request("http://localhost/api/admin/moderation/actions", {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: "Bearer token" },
    body: JSON.stringify(body),
  });

describe("PATCH /api/admin/moderation/actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorizeAdminRequest.mockResolvedValue({
      ok: true,
      admin: { id: "admin-1", authId: "auth-1", role: "admin" },
    });
    mocks.transaction.mockImplementation((callback) => callback(tx));
    mocks.profileFindUnique.mockResolvedValue({ id: "profile-1", status: "active" });
    mocks.profileUpdate.mockResolvedValue({});
    mocks.actionCreate.mockResolvedValue({});
  });

  it("プロフィールを非公開にして履歴を同じトランザクションで保存する", async () => {
    const response = await PATCH(
      request({
        targetType: "profile",
        targetId: "profile-1",
        action: "hide",
        reason: "不適切な内容のため",
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(mocks.profileUpdate).toHaveBeenCalledWith({
      where: { id: "profile-1" },
      data: { status: "hidden" },
    });
    expect(mocks.actionCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        adminUserId: "admin-1",
        previousStatus: "active",
        newStatus: "hidden",
        reason: "不適切な内容のため",
      }),
    });
  });

  it("理由が空の場合は400を返す", async () => {
    const response = await PATCH(
      request({ targetType: "audio", targetId: "profile-1", action: "hide", reason: " " }),
    );

    expect(response.status).toBe(400);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("管理操作JSONが16KBを超える場合は413を返す", async () => {
    const response = await PATCH(
      request({
        targetType: "profile",
        targetId: "profile-1",
        action: "hide",
        reason: "a".repeat(16 * 1024),
      }),
    );

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({
      error: "管理操作データは16KB以下にしてください。",
    });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("JSON以外のContent-Typeは認可後かつ本文解析前に415を返す", async () => {
    const moderationRequest = new Request(
      "http://localhost/api/admin/moderation/actions",
      {
        method: "PATCH",
        headers: {
          "Content-Type": "text/plain",
          Authorization: "Bearer token",
        },
        body: JSON.stringify({
          targetType: "profile",
          targetId: "profile-1",
          action: "hide",
          reason: "不適切な内容のため",
        }),
      },
    );

    const response = await PATCH(moderationRequest);

    expect(response.status).toBe(415);
    await expect(response.json()).resolves.toEqual({
      error: "Content-Typeはapplication/jsonを指定してください。",
    });
    expect(mocks.authorizeAdminRequest).toHaveBeenCalledWith(moderationRequest);
    expect(moderationRequest.bodyUsed).toBe(false);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("不正なJSONの場合は400を返す", async () => {
    const response = await PATCH(
      new Request("http://localhost/api/admin/moderation/actions", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer token",
        },
        body: "{invalid",
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "JSONの形式が不正です。",
    });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("同じ状態への変更は409で履歴を作らない", async () => {
    mocks.profileFindUnique.mockResolvedValue({ id: "profile-1", status: "hidden" });

    const response = await PATCH(
      request({ targetType: "profile", targetId: "profile-1", action: "hide", reason: "確認" }),
    );

    expect(response.status).toBe(409);
    expect(mocks.actionCreate).not.toHaveBeenCalled();
  });
});
