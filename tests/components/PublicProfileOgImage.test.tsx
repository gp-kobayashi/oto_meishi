import { beforeEach, describe, expect, it, vi } from "vitest";

const { findFirstMock, notFoundMock, imageResponseMock } = vi.hoisted(() => ({
  findFirstMock: vi.fn(),
  notFoundMock: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  imageResponseMock: vi.fn(function ImageResponse(
    element: unknown,
    options: unknown,
  ) {
    return { element, options };
  }),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: { profile: { findFirst: findFirstMock } },
}));

vi.mock("next/navigation", () => ({ notFound: notFoundMock }));
vi.mock("next/og", () => ({ ImageResponse: imageResponseMock }));

import ProfileOgImage, {
  alt,
  contentType,
  size,
} from "@/app/(card)/[userId]/opengraph-image";
import { createProfileOgPresentation } from "@/lib/publicProfileOg";

const profile = {
  id: "profile-1",
  userId: "user-1",
  theme: "colorful" as const,
  displayName: "表示名",
  bio: "紹介文\n\tです",
  audioUrl: "",
  audioKey: "",
  audioTitle: "",
  audioStatus: "active" as const,
  sns: [],
};

describe("公開プロフィールのOGP画像", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findFirstMock.mockResolvedValue(profile);
  });

  it("1200x630の画像レスポンスをプロフィールから生成する", async () => {
    const response = await ProfileOgImage({
      params: Promise.resolve({ userId: "user-1" }),
    });

    expect(alt).toContain("oto_meishi");
    expect(size).toEqual({ width: 1200, height: 630 });
    expect(contentType).toBe("image/png");
    expect(imageResponseMock).toHaveBeenCalledWith(expect.anything(), size);
    expect(response).toBeDefined();
  });

  it("テーマごとの安全な配色とUnicode単位のテキスト制限を適用する", () => {
    const presentation = createProfileOgPresentation({
      ...profile,
      displayName: "あ".repeat(100),
      bio: "い".repeat(200),
    });

    expect(presentation.palette.background).toBe("#fff1f2");
    expect(Array.from(presentation.displayName).length).toBeLessThanOrEqual(48);
    expect(Array.from(presentation.bio).length).toBeLessThanOrEqual(110);
    expect(presentation.displayName).not.toContain("\ud800");
  });

  it("表示名の改行・制御文字を正規化し、空の場合はブランド名へフォールバックする", () => {
    expect(
      createProfileOgPresentation({
        ...profile,
        displayName: "  表示\n\u0000名\t ",
      }).displayName,
    ).toBe("表示 名");
    expect(
      createProfileOgPresentation({
        ...profile,
        displayName: " \n\u0000\t ",
      }).displayName,
    ).toBe("oto_meishi");
  });

  it("非公開プロフィールは画像を生成せずnotFoundになる", async () => {
    findFirstMock.mockResolvedValue(null);

    await expect(
      ProfileOgImage({
        params: Promise.resolve({ userId: "hidden-user" }),
      }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFoundMock).toHaveBeenCalledOnce();
    expect(imageResponseMock).not.toHaveBeenCalled();
  });
});
