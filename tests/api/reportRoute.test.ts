import { beforeEach, describe, expect, it, vi } from "vitest";

const { mocks } = vi.hoisted(() => ({
  mocks: {
    profileFindUnique: vi.fn(),
    contentReportCreate: vi.fn(),
    consumeReportIpRateLimit: vi.fn(),
    consumeReportTargetRateLimit: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    profile: { findUnique: mocks.profileFindUnique },
    contentReport: { create: mocks.contentReportCreate },
  },
}));

vi.mock("@/lib/reportRateLimit", () => ({
  consumeReportIpRateLimit: mocks.consumeReportIpRateLimit,
  consumeReportTargetRateLimit: mocks.consumeReportTargetRateLimit,
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
    mocks.consumeReportIpRateLimit.mockReturnValue({
      allowed: true,
      limit: 10,
      remaining: 9,
      resetAt: Date.now() + 15 * 60 * 1000,
      retryAfterSeconds: 15 * 60,
    });
    mocks.consumeReportTargetRateLimit.mockReturnValue({
      allowed: true,
      limit: 3,
      remaining: 2,
      resetAt: Date.now() + 60 * 60 * 1000,
      retryAfterSeconds: 60 * 60,
    });
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

  it("IP全体の上限到達時は本文解析前に429を返す", async () => {
    mocks.consumeReportIpRateLimit.mockReturnValueOnce({
      allowed: false,
      limit: 10,
      remaining: 0,
      resetAt: 901_000,
      retryAfterSeconds: 120,
    });
    const request = new Request("http://localhost/api/reports", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": "203.0.113.10",
      },
      body: JSON.stringify({ profileId: "profile-1", reason: "other" }),
    });

    const response = await POST(request);

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("120");
    expect(response.headers.get("X-RateLimit-Limit")).toBe("10");
    await expect(response.json()).resolves.toEqual({
      error:
        "通報の送信回数が上限に達しました。しばらく待ってから再度お試しください。",
    });
    expect(mocks.consumeReportIpRateLimit).toHaveBeenCalledWith(
      "203.0.113.10",
    );
    expect(request.bodyUsed).toBe(false);
    expect(mocks.profileFindUnique).not.toHaveBeenCalled();
  });

  it("同じIPとプロフィールの上限到達時はDB照会前に429を返す", async () => {
    mocks.consumeReportTargetRateLimit.mockReturnValueOnce({
      allowed: false,
      limit: 3,
      remaining: 0,
      resetAt: 3_601_000,
      retryAfterSeconds: 900,
    });
    const request = new Request("http://localhost/api/reports", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": "203.0.113.10",
      },
      body: JSON.stringify({ profileId: "profile-1", reason: "harassment" }),
    });

    const response = await POST(request);

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("900");
    expect(response.headers.get("X-RateLimit-Limit")).toBe("3");
    await expect(response.json()).resolves.toEqual({
      error:
        "同じプロフィールへの通報が続いています。しばらく待ってから再度お試しください。",
    });
    expect(mocks.consumeReportTargetRateLimit).toHaveBeenCalledWith(
      "203.0.113.10",
      "profile-1",
    );
    expect(mocks.profileFindUnique).not.toHaveBeenCalled();
    expect(mocks.contentReportCreate).not.toHaveBeenCalled();
  });

  it("接続元IPを取得できない場合は回数制限をスキップする", async () => {
    const response = await POST(
      reportRequest({ profileId: "profile-1", reason: "other" }),
    );

    expect(response.status).toBe(201);
    expect(mocks.consumeReportIpRateLimit).not.toHaveBeenCalled();
    expect(mocks.consumeReportTargetRateLimit).not.toHaveBeenCalled();
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
