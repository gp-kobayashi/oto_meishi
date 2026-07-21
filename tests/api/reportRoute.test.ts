import { beforeEach, describe, expect, it, vi } from "vitest";

const { mocks } = vi.hoisted(() => ({
  mocks: {
    profileFindUnique: vi.fn(),
    contentReportCreate: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    profile: { findUnique: mocks.profileFindUnique },
    contentReport: { create: mocks.contentReportCreate },
  },
}));

import { POST } from "@/app/(site)/api/reports/route";

function reportRequest(body: unknown, contentType = "application/json") {
  return new Request("http://localhost/api/reports", {
    method: "POST",
    headers: { "Content-Type": contentType },
    body: JSON.stringify(body),
  });
}

describe("POST /api/reports", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.profileFindUnique.mockResolvedValue({
      id: "profile-1",
      status: "active",
    });
    mocks.contentReportCreate.mockResolvedValue({ id: "report-1" });
  });

  it("公開中プロフィールへの通報を保存する", async () => {
    const response = await POST(
      reportRequest({
        profileId: " profile-1 ",
        reason: "unsafe_link",
        details: " 不審なリンクです。 ",
      }),
    );

    expect(response.status).toBe(201);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual({ success: true });
    expect(mocks.profileFindUnique).toHaveBeenCalledWith({
      where: { id: "profile-1" },
      select: { id: true, status: true },
    });
    expect(mocks.contentReportCreate).toHaveBeenCalledWith({
      data: {
        profileId: "profile-1",
        reason: "unsafe_link",
        details: "不審なリンクです。",
      },
      select: { id: true },
    });
  });

  it("JSON以外のContent-Typeを415で拒否する", async () => {
    const response = await POST(
      reportRequest(
        { profileId: "profile-1", reason: "other" },
        "text/plain",
      ),
    );

    expect(response.status).toBe(415);
    expect(mocks.profileFindUnique).not.toHaveBeenCalled();
    expect(mocks.contentReportCreate).not.toHaveBeenCalled();
  });

  it("8KBを超える通報データを413で拒否する", async () => {
    const response = await POST(
      reportRequest({
        profileId: "profile-1",
        reason: "other",
        details: "a".repeat(8 * 1024),
      }),
    );

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({
      error: "通報データは8KB以下にしてください。",
    });
    expect(mocks.profileFindUnique).not.toHaveBeenCalled();
  });

  it("定義されていない通報理由を拒否する", async () => {
    const response = await POST(
      reportRequest({ profileId: "profile-1", reason: "spam" }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "通報理由を選択してください。",
    });
    expect(mocks.profileFindUnique).not.toHaveBeenCalled();
  });

  it("500文字を超える詳細を拒否する", async () => {
    const response = await POST(
      reportRequest({
        profileId: "profile-1",
        reason: "other",
        details: "あ".repeat(501),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "通報の詳細は500文字までです。",
    });
    expect(mocks.profileFindUnique).not.toHaveBeenCalled();
  });

  it.each([null, { id: "profile-1", status: "hidden" }])(
    "存在しないか非公開のプロフィールを404にする",
    async (profile) => {
      mocks.profileFindUnique.mockResolvedValueOnce(profile);

      const response = await POST(
        reportRequest({ profileId: "profile-1", reason: "harassment" }),
      );

      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toEqual({
        error: "通報対象が見つかりません。",
      });
      expect(mocks.contentReportCreate).not.toHaveBeenCalled();
    },
  );

  it("内部エラーの詳細をレスポンスへ公開しない", async () => {
    const internalError = new Error("database connection failed: secret-host");
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.contentReportCreate.mockRejectedValueOnce(internalError);

    try {
      const response = await POST(
        reportRequest({ profileId: "profile-1", reason: "other" }),
      );

      expect(response.status).toBe(500);
      await expect(response.json()).resolves.toEqual({
        error: "通報を受け付けられませんでした。",
      });
      expect(consoleError).toHaveBeenCalledWith(
        "Failed to create content report",
        internalError,
      );
    } finally {
      consoleError.mockRestore();
    }
  });
});
