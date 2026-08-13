import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { consumePersistentRateLimit } from "@/lib/persistentRateLimit";

const scope = `rate-${crypto.randomUUID()}`;
const otherScope = `${scope}-other`;

describe("永続レート制限の実DB処理", () => {
  beforeEach(async () => {
    await prisma.rateLimitCounter.deleteMany({
      where: { scope: { in: [scope, otherScope] } },
    });
  });

  afterAll(async () => {
    await prisma.rateLimitCounter.deleteMany({
      where: { scope: { in: [scope, otherScope] } },
    });
    await prisma.$disconnect();
  });

  it("並列リクエストでも許可数を上限以内に保ち、期限後にリセットする", async () => {
    const now = Date.now();
    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        consumePersistentRateLimit({
          scope,
          key: "same-client",
          limit: 2,
          windowMs: 1_000,
          now,
        }),
      ),
    );

    expect(results.filter((result) => result.allowed)).toHaveLength(2);
    await expect(
      consumePersistentRateLimit({
        scope,
        key: "same-client",
        limit: 2,
        windowMs: 1_000,
        now: now + 1_001,
      }),
    ).resolves.toMatchObject({ allowed: true, remaining: 1 });
  });

  it("scopeとkeyを独立させ、期限切れの別カウンターを削除する", async () => {
    const now = Date.now();
    await prisma.rateLimitCounter.create({
      data: {
        scope,
        keyHash: createHash("sha256").update("expired").digest("hex"),
        count: 1,
        resetAt: new Date(now - 1_000),
      },
    });

    const [differentKey, differentScope] = await Promise.all([
      consumePersistentRateLimit({
        scope,
        key: "active",
        limit: 1,
        windowMs: 1_000,
        now,
      }),
      consumePersistentRateLimit({
        scope: otherScope,
        key: "active",
        limit: 1,
        windowMs: 1_000,
        now,
      }),
    ]);

    expect(differentKey.allowed).toBe(true);
    expect(differentScope.allowed).toBe(true);
    expect(
      await prisma.rateLimitCounter.count({
        where: {
          scope,
          keyHash: createHash("sha256").update("expired").digest("hex"),
        },
      }),
    ).toBe(0);
  });
});
