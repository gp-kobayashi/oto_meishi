import { FixedWindowRateLimiter } from "@/lib/rateLimit";

const ADMIN_ACTION_LIMIT = 60;
const ADMIN_ACTION_WINDOW_MS = 15 * 60 * 1000;
const ADMIN_ACTION_IP_LIMIT = 120;

const adminRateLimiter = new FixedWindowRateLimiter(
  ADMIN_ACTION_LIMIT,
  ADMIN_ACTION_WINDOW_MS,
);
const ipRateLimiter = new FixedWindowRateLimiter(
  ADMIN_ACTION_IP_LIMIT,
  ADMIN_ACTION_WINDOW_MS,
);

export function consumeAdminActionRateLimit(adminId: string) {
  return adminRateLimiter.consume(adminId);
}

export function consumeAdminActionIpRateLimit(clientIp: string) {
  return ipRateLimiter.consume(clientIp);
}
