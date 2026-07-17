import { beforeEach, describe, expect, it, vi } from "vitest";

const { mocks } = vi.hoisted(() => ({
  mocks: {
    authorizeAdminRequest: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
    transaction: vi.fn(),
  },
}));

vi.mock("@/lib/adminAuth", () => ({
  authorizeAdminRequest: mocks.authorizeAdminRequest,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    profile: { findMany: mocks.findMany, count: mocks.count },
    $transaction: mocks.transaction,
  },
}));

import { GET } from "@/app/(site)/api/admin/moderation/route";

const request = (query = "") =>
  new Request(`http://localhost/api/admin/moderation${query}`, {
    headers: { Authorization: "Bearer valid-token" },
  });

describe("GET /api/admin/moderation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorizeAdminRequest.mockResolvedValue({
      ok: true,
      admin: { id: "admin-1", authId: "auth-1", role: "admin" },
    });
    mocks.findMany.mockReturnValue("find-many-query");
    mocks.count.mockReturnValue("count-query");
    mocks.transaction.mockResolvedValue([
      [
        {
          id: "profile-1",
          userId: "sample-user",
          displayName: "サンプル",
          status: "hidden",
          audioUrl: "https://example.com/audio.m4a",
          audioTitle: "自己紹介",
          audioStatus: "active",
          updatedAt: new Date("2026-07-17T00:00:00.000Z"),
          sns: [{ status: "active" }, { status: "hidden" }],
        },
      ],
      1,
    ]);
  });

  it("管理対象をページ情報付きで返す", async () => {
    const response = await GET(request("?filter=attention&page=2&q=sample"));
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result.items[0]).toMatchObject({
      userId: "sample-user",
      linkCount: 2,
      hiddenLinkCount: 1,
      updatedAt: "2026-07-17T00:00:00.000Z",
    });
    expect(result.pagination).toEqual({
      page: 2,
      pageSize: 20,
      total: 1,
      totalPages: 1,
    });
    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 20, take: 20 }),
    );
  });

  it("権限がない場合はDBへ問い合わせない", async () => {
    const deniedResponse = Response.json({ error: "権限なし" }, { status: 403 });
    mocks.authorizeAdminRequest.mockResolvedValue({
      ok: false,
      response: deniedResponse,
    });

    const response = await GET(request());

    expect(response.status).toBe(403);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("不正な絞り込み条件には400を返す", async () => {
    const response = await GET(request("?filter=invalid"));

    expect(response.status).toBe(400);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
