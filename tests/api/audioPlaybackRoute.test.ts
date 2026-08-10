import { beforeEach, describe, expect, it, vi } from "vitest";

const { mocks } = vi.hoisted(() => ({
  mocks: {
    findUnique: vi.fn(),
    createSignedAudioUrl: vi.fn(),
    extractKeyFromUrl: vi.fn(),
    consumePublicPlaybackIpRateLimit: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: { profile: { findUnique: mocks.findUnique } },
}));

vi.mock("@/lib/r2Storage", () => ({
  createSignedAudioUrl: mocks.createSignedAudioUrl,
  extractKeyFromUrl: mocks.extractKeyFromUrl,
}));

vi.mock("@/lib/audioPlaybackRateLimit", () => ({
  consumePublicPlaybackIpRateLimit:
    mocks.consumePublicPlaybackIpRateLimit,
}));

import { GET } from "@/app/(site)/api/audio/playback/route";

const request = (userId: string) =>
  new Request(`http://localhost/api/audio/playback?userId=${userId}`);

describe("GET /api/audio/playback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createSignedAudioUrl.mockResolvedValue("https://signed.example/audio");
    mocks.extractKeyFromUrl.mockReturnValue("audio/testuser/legacy.m4a");
    mocks.consumePublicPlaybackIpRateLimit.mockReturnValue({
      allowed: true,
      limit: 120,
      remaining: 119,
      resetAt: Date.now() + 15 * 60 * 1000,
      retryAfterSeconds: 15 * 60,
    });
  });

  it("公開中の音声に5分間有効な署名URLを返す", async () => {
    mocks.findUnique.mockResolvedValue({
      status: "active",
      accountModerationStatus: "active",
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

  it("アカウントが利用停止中なら公開状態の音声にも署名URLを発行しない", async () => {
    mocks.findUnique.mockResolvedValue({
      status: "active",
      accountModerationStatus: "suspended",
      audioStatus: "active",
      audioKey: "audio/testuser/voice.m4a",
      audioUrl: "",
    });

    const response = await GET(request("testuser"));

    expect(response.status).toBe(404);
    expect(mocks.createSignedAudioUrl).not.toHaveBeenCalled();
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
      accountModerationStatus: "active",
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

  it("接続元IPの発行回数が上限に達した場合はDB照会前に429を返す", async () => {
    mocks.consumePublicPlaybackIpRateLimit.mockReturnValueOnce({
      allowed: false,
      limit: 120,
      remaining: 0,
      resetAt: 901_000,
      retryAfterSeconds: 90,
    });
    const playbackRequest = new Request(
      "http://localhost/api/audio/playback?userId=testuser",
      { headers: { "X-Forwarded-For": "203.0.113.10, 10.0.0.1" } },
    );

    const response = await GET(playbackRequest);

    expect(response.status).toBe(429);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("Retry-After")).toBe("90");
    expect(response.headers.get("X-RateLimit-Limit")).toBe("120");
    await expect(response.json()).resolves.toEqual({
      error:
        "音声の再生リクエストが集中しています。しばらく待ってから再度お試しください。",
    });
    expect(mocks.consumePublicPlaybackIpRateLimit).toHaveBeenCalledWith(
      "203.0.113.10",
    );
    expect(mocks.findUnique).not.toHaveBeenCalled();
    expect(mocks.createSignedAudioUrl).not.toHaveBeenCalled();
  });

  it("接続元IPを取得できない場合も共通キーでIP制限する", async () => {
    mocks.findUnique.mockResolvedValue({
      status: "active",
      accountModerationStatus: "active",
      audioStatus: "active",
      audioKey: "audio/testuser/voice.m4a",
      audioUrl: "",
    });

    const response = await GET(request("testuser"));

    expect(response.status).toBe(200);
    expect(mocks.consumePublicPlaybackIpRateLimit).toHaveBeenCalledWith(
      "unresolved-client",
    );
  });
});
