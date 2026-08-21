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

import { generateMetadata } from "@/app/(card)/[userId]/page";
import {
  createProfileDescription,
  PROFILE_DESCRIPTION_LIMIT,
} from "@/lib/publicProfileMetadata";

const profile = {
  id: "profile-1",
  userId: "user/with space",
  theme: "normal" as const,
  displayName: "公開ユーザー",
  bio: "プロフィールです",
  audioUrl: "",
  audioKey: "",
  audioTitle: "",
  audioStatus: "active" as const,
  sns: [],
};

describe("公開プロフィールのメタデータ", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findFirstMock.mockResolvedValue(profile);
  });

  it("表示名、説明、canonical、OGP、Twitterを公開プロフィールから生成する", async () => {
    const metadata = await generateMetadata({
      params: Promise.resolve({ userId: profile.userId }),
    });

    expect(metadata).toMatchObject({
      title: "公開ユーザー | oto_meishi",
      description: "プロフィールです",
      alternates: {
        canonical: "https://oto-meishi.com/user%2Fwith%20space",
      },
      openGraph: {
        title: "公開ユーザー | oto_meishi",
        description: "プロフィールです",
        url: "https://oto-meishi.com/user%2Fwith%20space",
        siteName: "oto_meishi",
        locale: "ja_JP",
        type: "website",
      },
      twitter: {
        card: "summary_large_image",
        title: "公開ユーザー | oto_meishi",
        description: "プロフィールです",
      },
    });
  });

  it("説明文の改行・制御文字を正規化し、コードポイント単位で切り詰める", () => {
    const description = createProfileDescription(
      "表示名",
      `  最初の文\n\t\u0000${"あ".repeat(200)}  `,
    );

    expect(description).toBe(
      `最初の文 ${"あ".repeat(PROFILE_DESCRIPTION_LIMIT - 5)}`,
    );
    expect(Array.from(description)).toHaveLength(PROFILE_DESCRIPTION_LIMIT);
  });

  it("bioが空の場合は公開プロフィールのフォールバック説明を使う", () => {
    expect(createProfileDescription("公開ユーザー", " \n\t ")).toBe(
      "公開ユーザーさんの公開プロフィール",
    );
  });

  it("非公開プロフィールはnotFoundになり、メタデータを返さない", async () => {
    findFirstMock.mockResolvedValue(null);

    await expect(
      generateMetadata({
        params: Promise.resolve({ userId: "hidden-user" }),
      }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFoundMock).toHaveBeenCalledOnce();
  });
});
