import { createHash } from "node:crypto";
import { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import type { RateLimitResult } from "@/lib/rateLimit";

type CounterRow = { count: number; resetAt: Date };

export async function consumePersistentRateLimit({
  scope,
  key,
  limit,
  windowMs,
  now = Date.now(),
}: {
  scope: string;
  key: string;
  limit: number;
  windowMs: number;
  now?: number;
}): Promise<RateLimitResult> {
  validate(scope, key, limit, windowMs, now);
  const keyHash = createHash("sha256").update(key, "utf8").digest("hex");
  const nowDate = new Date(now);
  const resetDate = new Date(now + windowMs);
  const rows = await prisma.$queryRaw<CounterRow[]>(Prisma.sql`
    WITH cleanup AS (
      DELETE FROM "RateLimitCounter"
      WHERE "reset_at" <= ${nowDate}
        AND NOT ("scope" = ${scope} AND "key_hash" = ${keyHash})
        AND "reset_at" < ${nowDate}
        AND ctid IN (
          SELECT ctid FROM "RateLimitCounter"
          WHERE "reset_at" <= ${nowDate}
            AND NOT ("scope" = ${scope} AND "key_hash" = ${keyHash})
          ORDER BY "reset_at"
          LIMIT 50
        )
      RETURNING 1
    )
    INSERT INTO "RateLimitCounter" ("scope", "key_hash", "count", "reset_at", "created_at", "updated_at")
    VALUES (${scope}, ${keyHash}, 1, ${resetDate}, ${nowDate}, ${nowDate})
    ON CONFLICT ("scope", "key_hash") DO UPDATE
      SET "count" = CASE
        WHEN "RateLimitCounter"."reset_at" <= ${nowDate} THEN 1
        ELSE LEAST("RateLimitCounter"."count" + 1, ${limit + 1})
      END,
      "reset_at" = CASE
        WHEN "RateLimitCounter"."reset_at" <= ${nowDate} THEN EXCLUDED."reset_at"
        ELSE "RateLimitCounter"."reset_at"
      END,
      "updated_at" = ${nowDate}
    RETURNING "count", "reset_at" AS "resetAt"
  `);
  const row = rows[0];
  if (!row) {
    throw new Error("Rate limit counter upsert returned no row");
  }
  if (
    !Number.isInteger(row.count) ||
    row.count < 1 ||
    !(row.resetAt instanceof Date) ||
    !Number.isFinite(row.resetAt.getTime())
  ) {
    throw new Error("Invalid rate limit counter row");
  }
  const resetAt = row.resetAt.getTime();
  return {
    allowed: row.count <= limit,
    limit,
    remaining: Math.max(0, limit - row.count),
    resetAt,
    retryAfterSeconds: Math.max(1, Math.ceil((resetAt - now) / 1000)),
  };
}

function validate(
  scope: string,
  key: string,
  limit: number,
  windowMs: number,
  now: number,
) {
  if (
    typeof scope !== "string" ||
    scope.trim().length < 1 ||
    scope.length > 64
  ) {
    throw new Error(
      "scope must be a non-empty string of at most 64 characters",
    );
  }
  if (typeof key !== "string" || key.trim().length < 1 || key.length > 4096) {
    throw new Error(
      "key must be a non-empty string of at most 4096 characters",
    );
  }
  if (!Number.isSafeInteger(limit) || limit < 1) {
    throw new Error("limit must be a positive integer");
  }
  if (!Number.isSafeInteger(windowMs) || windowMs < 1) {
    throw new Error("windowMs must be positive");
  }
  if (
    !Number.isSafeInteger(now) ||
    now < 0 ||
    !Number.isFinite(now + windowMs)
  ) {
    throw new Error("now must be a non-negative safe integer");
  }
  if (
    !Number.isFinite(new Date(now).getTime()) ||
    !Number.isFinite(new Date(now + windowMs).getTime())
  ) {
    throw new Error("timestamps must be valid dates");
  }
}
