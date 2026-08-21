import { beforeEach, describe, expect, it, vi } from "vitest";

const { findFirstMock } = vi.hoisted(() => ({
  findFirstMock: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    profile: {
      findFirst: findFirstMock,
    },
  },
}));

import { getPublicProfile } from "@/lib/publicProfile";

const baseProfile = {
  id: "profile-1",
  userId: "active-user",
  theme: "normal" as const,
  displayName: "公開ユーザー",
  bio: "プロフィールです",
  audioUrl: "",
  audioKey: "audio/profile-1.m4a",
  audioTitle: "自己紹介",
  audioStatus: "active" as const,
  status: "active" as const,
  accountModerationStatus: "active" as const,
  sns: [
    {
      service: "youtube" as const,
      url: "https://youtube.com/example",
      label: "YouTube",
      status: "active" as const,
    },
    {
      service: "x" as const,
      url: "https://x.com/example",
      label: "X",
      status: "hidden" as const,
    },
  ],
};

describe("getPublicProfile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findFirstMock.mockImplementation(async ({ where }) => {
      if (
        where.userId === baseProfile.userId &&
        where.status === "active" &&
        where.accountModerationStatus === "active"
      ) {
        return baseProfile;
      }
      return null;
    });
  });

  it("公開中のプロフィールを表示用データへ変換し、非公開リンクを除外する", async () => {
    const result = await getPublicProfile("active-user");

    expect(findFirstMock).toHaveBeenCalledWith({
      where: {
        userId: "active-user",
        status: "active",
        accountModerationStatus: "active",
      },
      include: { sns: true },
    });
    expect(result).toEqual({
      id: "profile-1",
      userId: "active-user",
      theme: "normal",
      displayName: "公開ユーザー",
      bio: "プロフィールです",
      audioUrl: "",
      hasAudio: true,
      audioTitle: "自己紹介",
      sns: [
        {
          service: "youtube",
          url: "https://youtube.com/example",
          label: "YouTube",
        },
      ],
    });
  });

  it.each([["hidden-user"], ["suspended-user"], ["missing-user"]])(
    "%s は公開プロフィールとして扱わない",
    async (userId) => {
      const result = await getPublicProfile(userId);

      expect(result).toBeNull();
    },
  );
});
