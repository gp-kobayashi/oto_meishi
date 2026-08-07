import { beforeEach, describe, expect, it, vi } from "vitest";

const { findUniqueMock, notFoundMock } = vi.hoisted(() => ({
  findUniqueMock: vi.fn(),
  notFoundMock: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    profile: {
      findUnique: findUniqueMock,
    },
  },
}));

vi.mock("next/navigation", () => ({
  notFound: notFoundMock,
}));

import PublicProfilePage from "@/app/(card)/[userId]/page";

describe("公開プロフィールページ", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("アカウントが利用停止中ならプロフィール状態が公開中でも表示しない", async () => {
    findUniqueMock.mockResolvedValue({
      id: "profile-1",
      userId: "suspended-user",
      authId: "auth-1",
      displayName: "停止中ユーザー",
      bio: "",
      theme: "green",
      status: "active",
      accountModerationStatus: "suspended",
      audioStatus: "active",
      audioKey: "audio/profile-1.m4a",
      audioUrl: null,
      audioTitle: "自己紹介",
      sns: [],
    });

    await expect(
      PublicProfilePage({
        params: Promise.resolve({ userId: "suspended-user" }),
      }),
    ).rejects.toThrow("NEXT_NOT_FOUND");

    expect(notFoundMock).toHaveBeenCalledOnce();
  });
});
