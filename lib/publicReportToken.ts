import { createHmac, timingSafeEqual } from "node:crypto";

const TOKEN_TTL_SECONDS = 10 * 60;
const TEST_SECRET = "report-token-test-secret-01234567890123456789";

function secret() {
  const value =
    process.env.REPORT_TOKEN_SECRET ?? process.env.MODERATION_CLEANUP_SECRET;
  if (value?.trim()) return value.trim();
  if (process.env.NODE_ENV === "test") return TEST_SECRET;
  throw new Error("REPORT_TOKEN_SECRET is not configured.");
}

function sign(payload: string) {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function createPublicReportToken(profileId: string, now = Date.now()) {
  const payload = `${profileId}:${Math.floor(now / 1000) + TOKEN_TTL_SECONDS}`;
  return `${Buffer.from(payload).toString("base64url")}.${sign(payload)}`;
}

export function verifyPublicReportToken(
  token: unknown,
  profileId: string,
  now = Date.now(),
) {
  if (typeof token !== "string") return false;
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return false;
  let payload: string;
  try {
    payload = Buffer.from(encoded, "base64url").toString("utf8");
  } catch {
    return false;
  }
  const separator = payload.lastIndexOf(":");
  if (separator < 1) return false;
  const expiresAt = Number(payload.slice(separator + 1));
  if (
    payload.slice(0, separator) !== profileId ||
    !Number.isInteger(expiresAt) ||
    expiresAt < Math.floor(now / 1000)
  )
    return false;
  const expected = sign(payload);
  const received = Buffer.from(signature);
  const expectedBytes = Buffer.from(expected);
  return (
    received.length === expectedBytes.length &&
    timingSafeEqual(received, expectedBytes)
  );
}
