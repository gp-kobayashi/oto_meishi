import { beforeEach, describe, expect, it, vi } from "vitest";

const { findManyMock } = vi.hoisted(() => ({
  findManyMock: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    profile: {
      findMany: findManyMock,
    },
  },
}));

import sitemap from "@/app/sitemap";
import robots from "@/app/robots";

describe("サイトマップとrobots.txt", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("公開中のプロフィールだけを決定的な順序でサイトマップへ追加する", async () => {
    const older = new Date("2026-01-01T00:00:00.000Z");
    const newer = new Date("2026-02-01T00:00:00.000Z");
    findManyMock.mockResolvedValue([
      { userId: "a/user", updatedAt: older },
      { userId: "z-user", updatedAt: newer },
    ]);

    await expect(sitemap()).resolves.toEqual([
      {
        url: "https://oto-meishi.com/",
        changeFrequency: "weekly",
        priority: 1,
      },
      {
        url: "https://oto-meishi.com/a%2Fuser",
        lastModified: older,
        changeFrequency: "weekly",
        priority: 0.7,
      },
      {
        url: "https://oto-meishi.com/z-user",
        lastModified: newer,
        changeFrequency: "weekly",
        priority: 0.7,
      },
    ]);
    expect(findManyMock).toHaveBeenCalledWith({
      where: {
        status: "active",
        accountModerationStatus: "active",
      },
      select: {
        userId: true,
        updatedAt: true,
      },
      orderBy: { userId: "asc" },
    });
  });

  it("robots.txtはサイト全体を許可し、絶対URLのサイトマップを参照する", () => {
    expect(robots()).toEqual({
      rules: { userAgent: "*", allow: "/" },
      sitemap: "https://oto-meishi.com/sitemap.xml",
      host: "https://oto-meishi.com",
    });
  });
});
