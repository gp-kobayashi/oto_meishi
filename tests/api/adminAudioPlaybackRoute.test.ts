import { beforeEach, describe, expect, it, vi } from "vitest";

const { mocks } = vi.hoisted(() => ({
  mocks: {
    authorizeAdminRequest: vi.fn(),
    findUnique: vi.fn(),
    createSignedAudioUrl: vi.fn(),
    extractKeyFromUrl: vi.fn(),
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

  it("音声がなければ署名URLを発行しない", async () => {
    mocks.findUnique.mockResolvedValue({ audioKey: "", audioUrl: "" });

    const response = await GET(request());

    expect(response.status).toBe(404);
    expect(mocks.createSignedAudioUrl).not.toHaveBeenCalled();
  });
});
