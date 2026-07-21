import { FixedWindowRateLimiter } from "@/lib/rateLimit";

const REPORT_IP_LIMIT = 10;
const REPORT_IP_WINDOW_MS = 15 * 60 * 1000;
const REPORT_TARGET_LIMIT = 3;
const REPORT_TARGET_WINDOW_MS = 60 * 60 * 1000;

const ipRateLimiter = new FixedWindowRateLimiter(
  REPORT_IP_LIMIT,
  REPORT_IP_WINDOW_MS,
);
const targetRateLimiter = new FixedWindowRateLimiter(
  REPORT_TARGET_LIMIT,
  REPORT_TARGET_WINDOW_MS,
);

export function consumeReportIpRateLimit(clientIp: string) {
  return ipRateLimiter.consume(clientIp);
}

export function consumeReportTargetRateLimit(
  clientIp: string,
  profileId: string,
) {
  return targetRateLimiter.consume(`${clientIp}\u0000${profileId}`);
}
