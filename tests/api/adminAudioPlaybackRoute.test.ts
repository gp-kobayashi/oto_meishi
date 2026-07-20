import { beforeEach, describe, expect, it, vi } from "vitest";

const { mocks } = vi.hoisted(() => ({
  mocks: {
    authorizeAdminRequest: vi.fn(),
    findUnique: vi.fn(),
    createSignedAudioUrl: vi.fn(),
    extractKeyFromUrl: vi.fn(),
    consumeAdminPlaybackRateLimit: vi.fn(),
    consumeAdminPlaybackIpRateLimit: vi.fn(),
  },
}));

vi.mock("@/lib/adminAuth", () => ({
  authorizeAdminRequest: mocks.authorizeAdminRequest,
}));
vi.mock("@/lib/prisma", () => ({
  prisma: { profile: { findUnique: mocks.findUnique } },
}));
vi.mock("@/lib/r2Storage", () => ({
  createSignedAudioUrl: mocks.createSignedAudioUrl,
  extractKeyFromUrl: mocks.extractKeyFromUrl,
}));
vi.mock("@/lib/audioPlaybackRateLimit", () => ({
  consumeAdminPlaybackRateLimit: mocks.consumeAdminPlaybackRateLimit,
  consumeAdminPlaybackIpRateLimit: mocks.consumeAdminPlaybackIpRateLimit,
}));

import { GET } from "@/app/(site)/api/admin/audio/playback/route";

const request = (profileId = "profile-1") =>
  new Request(
    `http://localhost/api/admin/audio/playback?profileId=${profileId}`,
    { headers: { Authorization: "Bearer admin-token" } },
  );

describe("GET /api/admin/audio/playback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorizeAdminRequest.mockResolvedValue({
      ok: true,
      admin: { id: "admin-1", authId: "auth-1", role: "admin" },
    });
    mocks.findUnique.mockResolvedValue({
      audioKey: "audio/testuser/voice.m4a",
      audioUrl: "",
    });
    mocks.createSignedAudioUrl.mockResolvedValue("https://signed.example/audio");
    mocks.consumeAdminPlaybackRateLimit.mockReturnValue({
      allowed: true,
      limit: 60,
      remaining: 59,
      resetAt: Date.now() + 15 * 60 * 1000,
      retryAfterSeconds: 15 * 60,
    });
    mocks.consumeAdminPlaybackIpRateLimit.mockReturnValue({
      allowed: true,
      limit: 120,
      remaining: 119,
      resetAt: Date.now() + 15 * 60 * 1000,
      retryAfterSeconds: 15 * 60,
    });
  });

  it("管理者に5分間有効な署名URLを返す", async () => {
    const response = await GET(request());

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

  it("管理者権限がなければプロフィールを検索しない", async () => {
    mocks.authorizeAdminRequest.mockResolvedValue({
      ok: false,
      response: Response.json({ error: "権限なし" }, { status: 403 }),
    });

    const response = await GET(request());

    expect(response.status).toBe(403);
    expect(mocks.findUnique).not.toHaveBeenCalled();
    expect(mocks.createSignedAudioUrl).not.toHaveBeenCalled();
  });

  it("管理者の発行回数が上限に達した場合はプロフィール検索前に429を返す", async () => {
    mocks.consumeAdminPlaybackRateLimit.mockReturnValueOnce({
      allowed: false,
      limit: 60,
      remaining: 0,
      resetAt: 901_000,
      retryAfterSeconds: 120,
    });

    const response = await GET(request());

    expect(response.status).toBe(429);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("Retry-After")).toBe("120");
    expect(response.headers.get("X-RateLimit-Limit")).toBe("60");
    await expect(response.json()).resolves.toEqual({
      error:
        "管理者向け音声の再生リクエストが集中しています。しばらく待ってから再度お試しください。",
    });
    expect(mocks.consumeAdminPlaybackRateLimit).toHaveBeenCalledWith(
      "admin-1",
    );
    expect(mocks.findUnique).not.toHaveBeenCalled();
    expect(mocks.createSignedAudioUrl).not.toHaveBeenCalled();
  });

  it("接続元IPの発行回数が上限に達した場合はプロフィール検索前に429を返す", async () => {
    mocks.consumeAdminPlaybackIpRateLimit.mockReturnValueOnce({
      allowed: false,
      limit: 120,
      remaining: 0,
      resetAt: 901_000,
      retryAfterSeconds: 90,
    });
    const playbackRequest = new Request(
      "http://localhost/api/admin/audio/playback?profileId=profile-1",
      {
        headers: {
          Authorization: "Bearer admin-token",
          "CF-Connecting-IP": "203.0.113.10",
        },
      },
    );

    const response = await GET(playbackRequest);

    expect(response.status).toBe(429);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("Retry-After")).toBe("90");
    expect(response.headers.get("X-RateLimit-Limit")).toBe("120");
    await expect(response.json()).resolves.toEqual({
      error:
        "この接続元からの管理者向け音声再生が集中しています。しばらく待ってから再度お試しください。",
    });
    expect(mocks.consumeAdminPlaybackIpRateLimit).toHaveBeenCalledWith(
      "203.0.113.10",
    );
    expect(mocks.findUnique).not.toHaveBeenCalled();
    expect(mocks.createSignedAudioUrl).not.toHaveBeenCalled();
  });

  it("接続元IPを取得できない場合はIP制限をスキップする", async () => {
    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(mocks.consumeAdminPlaybackIpRateLimit).not.toHaveBeenCalled();
  });

  it("音声がなければ署名URLを発行しない", async () => {
    mocks.findUnique.mockResolvedValue({ audioKey: "", audioUrl: "" });

    const response = await GET(request());

    expect(response.status).toBe(404);
    expect(mocks.createSignedAudioUrl).not.toHaveBeenCalled();
  });
});
