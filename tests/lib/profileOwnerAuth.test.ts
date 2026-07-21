import { beforeEach, describe, expect, it, vi } from "vitest";

const { mocks } = vi.hoisted(() => ({
  mocks: { getUser: vi.fn(), findUnique: vi.fn() },
}));

vi.mock("@/lib/supabaseClient", () => ({
  createServerSupabaseClient: () => ({ auth: { getUser: mocks.getUser } }),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: { profile: { findUnique: mocks.findUnique } },
}));

import { authorizeProfileOwnerRequest } from "@/lib/profileOwnerAuth";

const request = (token = "valid-token") =>
  new Request("http://localhost/api/notifications", {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

describe("authorizeProfileOwnerRequest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "auth-user-1" } },
      error: null,
    });
    mocks.findUnique.mockResolvedValue({ id: "profile-1" });
  });

  it("認証ユーザーに紐づくプロフィールIDを返す", async () => {
    const result = await authorizeProfileOwnerRequest(request());

    expect(result).toEqual({
      ok: true,
      userId: "auth-user-1",
      profileId: "profile-1",
    });
    expect(mocks.findUnique).toHaveBeenCalledWith({
      where: { authId: "auth-user-1" },
      select: { id: true },
    });
  });

  it("トークンがない場合は認証を拒否する", async () => {
    const result = await authorizeProfileOwnerRequest(request(""));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(401);
    expect(mocks.getUser).not.toHaveBeenCalled();
  });

  it("プロフィールが紐づいていない場合は404を返す", async () => {
    mocks.findUnique.mockResolvedValue(null);

    const result = await authorizeProfileOwnerRequest(request());

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(404);
  });
});
