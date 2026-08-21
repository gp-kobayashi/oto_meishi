import { beforeEach, describe, expect, it, vi } from "vitest";

const { findFirstMock, notFoundMock } = vi.hoisted(() => ({
  findFirstMock: vi.fn(),
  notFoundMock: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    profile: {
      findFirst: findFirstMock,
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
    findFirstMock.mockResolvedValue(null);

    await expect(
      PublicProfilePage({
        params: Promise.resolve({ userId: "suspended-user" }),
      }),
    ).rejects.toThrow("NEXT_NOT_FOUND");

    expect(notFoundMock).toHaveBeenCalledOnce();
    expect(findFirstMock).toHaveBeenCalledWith({
      where: {
        userId: "suspended-user",
        status: "active",
        accountModerationStatus: "active",
      },
      include: { sns: true },
    });
  });
});
