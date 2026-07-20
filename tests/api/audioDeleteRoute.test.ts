import { beforeEach, describe, expect, it, vi } from "vitest";

const { mocks } = vi.hoisted(() => ({
  mocks: {
    getUser: vi.fn(),
    findUnique: vi.fn(),
    updateMany: vi.fn(),
    extractKeyFromUrl: vi.fn(),
    deleteFromR2: vi.fn(),
  },
}));

vi.mock("@/lib/supabaseClient", () => ({
  createServerSupabaseClient: () => ({ auth: { getUser: mocks.getUser } }),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    profile: {
      findUnique: mocks.findUnique,
      updateMany: mocks.updateMany,
    },
  },
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
    mocks.updateMany.mockResolvedValue({ count: 1 });
  });

  it("本人のR2音源を削除してプロフィールを未登録にする", async () => {
    const response = await DELETE(request());

    expect(response.status).toBe(200);
    expect(mocks.findUnique).toHaveBeenCalledWith({
      where: { authId: "auth-user-1" },
      select: { audioUrl: true, audioKey: true },
    });
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: {
        authId: "auth-user-1",
        audioUrl: "https://r2.example/audio/test/old.m4a",
        audioKey: "audio/test/old.m4a",
      },
      data: { audioUrl: "", audioKey: "", audioTitle: "" },
    });
    expect(mocks.deleteFromR2).toHaveBeenCalledWith("audio/test/old.m4a");
    expect(mocks.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.deleteFromR2.mock.invocationCallOrder[0],
    );
  });

  it("R2削除に失敗してもプロフィールの参照解除は成功として返す", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.deleteFromR2.mockRejectedValue(new Error("R2 error"));

    try {
      const response = await DELETE(request());

      expect(response.status).toBe(200);
      expect(mocks.updateMany).toHaveBeenCalled();
      expect(consoleError).toHaveBeenCalledWith(
        "Failed to delete unreferenced audio file from R2:",
        expect.any(Error),
      );
    } finally {
      consoleError.mockRestore();
    }
  });

  it("取得後に音声が更新されていた場合は削除を中止する", async () => {
    mocks.updateMany.mockResolvedValueOnce({ count: 0 });

    const response = await DELETE(request());

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "音源が更新されているため削除を中止しました。",
    });
    expect(mocks.deleteFromR2).not.toHaveBeenCalled();
  });

  it("DB更新に失敗した場合はR2音声を削除しない", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.updateMany.mockRejectedValueOnce(new Error("database error"));

    try {
      const response = await DELETE(request());

      expect(response.status).toBe(500);
      expect(mocks.deleteFromR2).not.toHaveBeenCalled();
    } finally {
      consoleError.mockRestore();
    }
  });
});
