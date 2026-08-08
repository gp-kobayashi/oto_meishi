import { beforeEach, describe, expect, it, vi } from "vitest";

const { processModerationDeadlines } = vi.hoisted(() => ({
  processModerationDeadlines: vi.fn(),
}));

vi.mock("@/lib/moderationDeadlineProcessor", () => ({
  processModerationDeadlines,
}));

import { POST } from "@/app/(site)/api/internal/moderation/deadlines/route";

const request = (secret?: string) =>
  new Request("http://localhost/api/internal/moderation/deadlines", {
    method: "POST",
    headers: secret ? { Authorization: `Bearer ${secret}` } : undefined,
  });

describe("POST /api/internal/moderation/deadlines", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.MODERATION_CLEANUP_SECRET = "cleanup-secret";
    processModerationDeadlines.mockResolvedValue({
      examined: 3,
      suspended: 1,
      deletionScheduled: 1,
      deletionCandidates: 1,
      deleted: 1,
      pendingAuthDeletionsCompleted: 0,
      skipped: 0,
      failed: 0,
    });
  });

  it("正しいBearerトークンで期限処理を実行する", async () => {
    const response = await POST(request("cleanup-secret"));

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual({
      examined: 3,
      suspended: 1,
      deletionScheduled: 1,
      deletionCandidates: 1,
      deleted: 1,
      pendingAuthDeletionsCompleted: 0,
      skipped: 0,
      failed: 0,
    });
    expect(processModerationDeadlines).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["トークンなし", undefined],
    ["不正なトークン", "wrong-secret"],
  ])("%sでは実行しない", async (_label, secret) => {
    const response = await POST(request(secret));

    expect(response.status).toBe(401);
    expect(processModerationDeadlines).not.toHaveBeenCalled();
  });

  it("サーバー側のシークレットが未設定なら実行しない", async () => {
    delete process.env.MODERATION_CLEANUP_SECRET;

    const response = await POST(request("cleanup-secret"));

    expect(response.status).toBe(401);
    expect(processModerationDeadlines).not.toHaveBeenCalled();
  });

  it("処理全体の失敗を外部へ詳細公開しない", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    processModerationDeadlines.mockRejectedValueOnce(
      new Error("database connection details"),
    );

    const response = await POST(request("cleanup-secret"));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Deadline processing failed",
    });
  });
});
