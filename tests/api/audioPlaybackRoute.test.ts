import { beforeEach, describe, expect, it, vi } from "vitest";

const { mocks } = vi.hoisted(() => ({
  mocks: {
    findUnique: vi.fn(),
    createSignedAudioUrl: vi.fn(),
    extractKeyFromUrl: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: { profile: { findUnique: mocks.findUnique } },
}));

vi.mock("@/lib/r2Storage", () => ({
  createSignedAudioUrl: mocks.createSignedAudioUrl,
  extractKeyFromUrl: mocks.extractKeyFromUrl,
}));

import { GET } from "@/app/(site)/api/audio/playback/route";

const request = (userId: string) =>
  new Request(`http://localhost/api/audio/playback?userId=${userId}`);

describe("GET /api/audio/playback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createSignedAudioUrl.mockResolvedValue("https://signed.example/audio");
    mocks.extractKeyFromUrl.mockReturnValue("audio/testuser/legacy.m4a");
  });

  it("公開中の音声に5分間有効な署名URLを返す", async () => {
    mocks.findUnique.mockResolvedValue({
      status: "active",
      audioStatus: "active",
      audioKey: "audio/testuser/voice.m4a",
      audioUrl: "",
    });

    const response = await GET(request("testuser"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      audioUrl: "https://signed.example/audio",
    });
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(mocks.createSignedAudioUrl).toHaveBeenCalledWith(
      "audio/testuser/voice.m4a",
      300,
    );
  });

  it.each([
    ["hidden", "active"],
    ["active", "hidden"],
    ["active", "removed"],
  ])("非公開状態では署名URLを発行しない", async (status, audioStatus) => {
    mocks.findUnique.mockResolvedValue({
      status,
      audioStatus,
      audioKey: "audio/testuser/voice.m4a",
      audioUrl: "",
    });

    const response = await GET(request("testuser"));

    expect(response.status).toBe(404);
    expect(mocks.createSignedAudioUrl).not.toHaveBeenCalled();
  });

  it("旧データでは公開URLからオブジェクトキーを抽出する", async () => {
    mocks.findUnique.mockResolvedValue({
      status: "active",
      audioStatus: "active",
      audioKey: "",
      audioUrl: "https://r2.example/audio/testuser/legacy.m4a",
    });

    const response = await GET(request("testuser"));

    expect(response.status).toBe(200);
    expect(mocks.extractKeyFromUrl).toHaveBeenCalledWith(
      "https://r2.example/audio/testuser/legacy.m4a",
    );
    expect(mocks.createSignedAudioUrl).toHaveBeenCalledWith(
      "audio/testuser/legacy.m4a",
      300,
    );
  });

  it("不正なユーザーIDをDB問い合わせ前に拒否する", async () => {
    const response = await GET(request("../other"));

    expect(response.status).toBe(400);
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });
});
