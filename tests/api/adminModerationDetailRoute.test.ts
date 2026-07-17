import { beforeEach, describe, expect, it, vi } from "vitest";

const { mocks } = vi.hoisted(() => ({
  mocks: {
    authorizeAdminRequest: vi.fn(),
    findUnique: vi.fn(),
  },
}));

vi.mock("@/lib/adminAuth", () => ({
  authorizeAdminRequest: mocks.authorizeAdminRequest,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: { profile: { findUnique: mocks.findUnique } },
}));

import { GET } from "@/app/(site)/api/admin/moderation/[profileId]/route";

const request = () =>
  new Request("http://localhost/api/admin/moderation/profile-1", {
    headers: { Authorization: "Bearer valid-token" },
  });

const context = (profileId = "profile-1") => ({
  params: Promise.resolve({ profileId }),
});

describe("GET /api/admin/moderation/[profileId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorizeAdminRequest.mockResolvedValue({
      ok: true,
      admin: { id: "admin-1", authId: "auth-1", role: "admin" },
    });
    mocks.findUnique.mockResolvedValue({
      id: "profile-1",
      userId: "sample-user",
      displayName: "サンプル",
      bio: "自己紹介",
      theme: "normal",
      status: "active",
      audioUrl: "https://example.com/audio.m4a",
      audioTitle: "音声",
      audioStatus: "active",
      createdAt: new Date("2026-07-16T00:00:00.000Z"),
      updatedAt: new Date("2026-07-17T00:00:00.000Z"),
      sns: [
        {
          id: "link-1",
          service: "youtube",
          label: "YouTube",
          url: "https://youtube.com/example",
          sortOrder: 0,
          status: "hidden",
        },
      ],
    });
  });

  it("プロフィール・音声・リンクの詳細を返す", async () => {
    const response = await GET(request(), context());
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result.profile).toMatchObject({
      id: "profile-1",
      userId: "sample-user",
      createdAt: "2026-07-16T00:00:00.000Z",
      links: [{ id: "link-1", status: "hidden" }],
    });
  });

  it("プロフィールが存在しない場合は404を返す", async () => {
    mocks.findUnique.mockResolvedValue(null);

    const response = await GET(request(), context("missing"));

    expect(response.status).toBe(404);
  });

  it("権限がない場合はDBへ問い合わせない", async () => {
    mocks.authorizeAdminRequest.mockResolvedValue({
      ok: false,
      response: Response.json({ error: "権限なし" }, { status: 403 }),
    });

    const response = await GET(request(), context());

    expect(response.status).toBe(403);
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });
});
