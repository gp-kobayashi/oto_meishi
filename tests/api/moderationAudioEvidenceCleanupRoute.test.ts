import { beforeEach, describe, expect, it, vi } from "vitest";

const { cleanupExpiredModerationAudioEvidence } = vi.hoisted(() => ({
  cleanupExpiredModerationAudioEvidence: vi.fn(),
}));

vi.mock("@/lib/moderationAudioEvidenceCleanup", () => ({
  cleanupExpiredModerationAudioEvidence,
}));

import { POST } from "@/app/(site)/api/internal/moderation/audio-evidence/cleanup/route";

const request = (secret?: string) =>
  new Request(
    "http://localhost/api/internal/moderation/audio-evidence/cleanup",
    {
      method: "POST",
      headers: secret ? { Authorization: `Bearer ${secret}` } : undefined,
    },
  );

describe("POST /api/internal/moderation/audio-evidence/cleanup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.MODERATION_CLEANUP_SECRET = "cleanup-secret";
    cleanupExpiredModerationAudioEvidence.mockResolvedValue({
      examined: 2,
      deletedObjects: 1,
      releasedReferences: 2,
      failed: 0,
      pending: { examined: 1, deleted: 1, failed: 0, skipped: 0 },
    });
  });

  it("正しいBearerトークンで期限切れ証拠音声を削除する", async () => {
    const response = await POST(request("cleanup-secret"));

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual({
      examined: 2,
      deletedObjects: 1,
      releasedReferences: 2,
      failed: 0,
      pending: { examined: 1, deleted: 1, failed: 0, skipped: 0 },
    });
    expect(cleanupExpiredModerationAudioEvidence).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["トークンなし", undefined],
    ["不正なトークン", "wrong-secret"],
  ])("%sでは実行しない", async (_label, secret) => {
    const response = await POST(request(secret));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
    expect(cleanupExpiredModerationAudioEvidence).not.toHaveBeenCalled();
  });

  it("サーバー側のシークレットが未設定なら実行しない", async () => {
    delete process.env.MODERATION_CLEANUP_SECRET;

    const response = await POST(request("cleanup-secret"));

    expect(response.status).toBe(401);
    expect(cleanupExpiredModerationAudioEvidence).not.toHaveBeenCalled();
  });

  it("クリーンアップ全体の失敗を外部へ詳細公開しない", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    cleanupExpiredModerationAudioEvidence.mockRejectedValueOnce(
      new Error("database connection details"),
    );

    const response = await POST(request("cleanup-secret"));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "Cleanup failed" });
  });
});
