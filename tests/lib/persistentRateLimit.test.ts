import { describe, expect, it, vi, beforeEach } from "vitest";

const { queryRaw } = vi.hoisted(() => ({ queryRaw: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { $queryRaw: queryRaw } }));

import { consumePersistentRateLimit } from "@/lib/persistentRateLimit";

describe("永続レート制限", () => {
  beforeEach(() => queryRaw.mockReset());

  it("許可結果とSHA-256ハッシュを返す", async () => {
    queryRaw.mockResolvedValue([{ count: 1, resetAt: new Date(1100) }]);
    const result = await consumePersistentRateLimit({
      scope: "x",
      key: "secret-ip",
      limit: 2,
      windowMs: 1000,
      now: 100,
    });
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(1);
    expect(result.retryAfterSeconds).toBe(1);
    const serialized = JSON.stringify(queryRaw.mock.calls[0][0]);
    expect(serialized).not.toContain("secret-ip");
    expect(serialized).toContain("key_hash");
    expect(serialized).toContain(
      "6578d5e7cdc1b0d1107bf9aee58593043d596ba8976e90029dae9a8650982174",
    );
  });

  it("上限超過を拒否する", async () => {
    queryRaw.mockResolvedValue([{ count: 3, resetAt: new Date(2000) }]);
    await expect(
      consumePersistentRateLimit({
        scope: "x",
        key: "k",
        limit: 2,
        windowMs: 1000,
        now: 100,
      }),
    ).resolves.toMatchObject({ allowed: false, remaining: 0 });
  });

  it("入力を検証する", async () => {
    await expect(
      consumePersistentRateLimit({
        scope: " ",
        key: "k",
        limit: 1,
        windowMs: 1,
      }),
    ).rejects.toThrow();
    await expect(
      consumePersistentRateLimit({
        scope: "x",
        key: "k",
        limit: 1.2,
        windowMs: 1,
      }),
    ).rejects.toThrow();
    queryRaw.mockResolvedValue([]);
    await expect(
      consumePersistentRateLimit({
        scope: "x",
        key: "k",
        limit: 1,
        windowMs: 1,
      }),
    ).rejects.toThrow("no row");
  });

  it("DBエラーを伝播する", async () => {
    queryRaw.mockRejectedValueOnce(new Error("db"));
    await expect(
      consumePersistentRateLimit({
        scope: "x",
        key: "k",
        limit: 1,
        windowMs: 1,
      }),
    ).rejects.toThrow("db");
  });

  it("不正な返却行を拒否する", async () => {
    queryRaw.mockResolvedValueOnce([{ count: 0, resetAt: new Date(1000) }]);
    await expect(
      consumePersistentRateLimit({
        scope: "x",
        key: "k",
        limit: 1,
        windowMs: 1,
      }),
    ).rejects.toThrow("Invalid rate limit counter row");
  });
});
