import { beforeEach, describe, expect, it, vi } from "vitest";

const { mocks } = vi.hoisted(() => ({
  mocks: {
    getUser: vi.fn(),
    findUnique: vi.fn(),
  },
}));

vi.mock("@/lib/supabaseClient", () => ({
  createServerSupabaseClient: () => ({ auth: { getUser: mocks.getUser } }),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: { adminUser: { findUnique: mocks.findUnique } },
}));

import { GET } from "@/app/(site)/api/admin/session/route";

const request = (token = "valid-token") =>
  new Request("http://localhost/api/admin/session", {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

describe("GET /api/admin/session", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "auth-admin-1" } },
      error: null,
    });
    mocks.findUnique.mockResolvedValue({
      id: "admin-1",
      authId: "auth-admin-1",
      role: "admin",
      isActive: true,
    });
  });

  it("有効な管理者情報を返す", async () => {
    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await response.json()).toEqual({
      admin: { id: "admin-1", authId: "auth-admin-1", role: "admin" },
    });
    expect(mocks.findUnique).toHaveBeenCalledWith({
      where: { authId: "auth-admin-1" },
      select: { id: true, authId: true, role: true, isActive: true },
    });
  });

  it("トークンがない場合は401を返す", async () => {
    const response = await GET(request(""));

    expect(response.status).toBe(401);
    expect(mocks.getUser).not.toHaveBeenCalled();
  });

  it("Supabaseでトークンを検証できない場合は401を返す", async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: null },
      error: new Error("invalid token"),
    });

    const response = await GET(request());

    expect(response.status).toBe(401);
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });

  it("管理者として登録されていない場合は403を返す", async () => {
    mocks.findUnique.mockResolvedValue(null);

    const response = await GET(request());

    expect(response.status).toBe(403);
  });

  it("無効化された管理者の場合は403を返す", async () => {
    mocks.findUnique.mockResolvedValue({
      id: "admin-1",
      authId: "auth-admin-1",
      role: "admin",
      isActive: false,
    });

    const response = await GET(request());

    expect(response.status).toBe(403);
  });
});
