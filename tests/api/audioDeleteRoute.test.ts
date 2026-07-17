import { beforeEach, describe, expect, it, vi } from "vitest";

const { mocks } = vi.hoisted(() => ({
  mocks: {
    getUser: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    extractKeyFromUrl: vi.fn(),
    deleteFromR2: vi.fn(),
  },
}));

vi.mock("@/lib/supabaseClient", () => ({
  createServerSupabaseClient: () => ({ auth: { getUser: mocks.getUser } }),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: { profile: { findUnique: mocks.findUnique, update: mocks.update } },
}));
vi.mock("@/lib/r2Storage", () => ({
  extractKeyFromUrl: mocks.extractKeyFromUrl,
  deleteFromR2: mocks.deleteFromR2,
}));

import { DELETE } from "@/app/(site)/api/audio/route";

const request = () =>
  new Request("http://localhost/api/audio", {
    method: "DELETE",
    headers: { Authorization: "Bearer valid-token" },
  });

describe("DELETE /api/audio", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "auth-user-1" } },
      error: null,
    });
    mocks.findUnique.mockResolvedValue({
      audioUrl: "https://r2.example/audio/test/old.m4a",
      audioKey: "audio/test/old.m4a",
    });
    mocks.extractKeyFromUrl.mockReturnValue("audio/test/old.m4a");
    mocks.deleteFromR2.mockResolvedValue(undefined);
    mocks.update.mockResolvedValue({ audioUrl: "", audioTitle: "" });
  });

  it("本人のR2音源を削除してプロフィールを未登録にする", async () => {
    const response = await DELETE(request());

    expect(response.status).toBe(200);
    expect(mocks.findUnique).toHaveBeenCalledWith({
      where: { authId: "auth-user-1" },
      select: { audioUrl: true, audioKey: true },
    });
    expect(mocks.deleteFromR2).toHaveBeenCalledWith("audio/test/old.m4a");
    expect(mocks.update).toHaveBeenCalledWith({
      where: { authId: "auth-user-1" },
      data: { audioUrl: "", audioKey: "", audioTitle: "" },
    });
  });

  it("R2削除に失敗した場合はプロフィールを変更しない", async () => {
    mocks.deleteFromR2.mockRejectedValue(new Error("R2 error"));

    const response = await DELETE(request());

    expect(response.status).toBe(500);
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
