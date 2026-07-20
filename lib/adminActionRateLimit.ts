import { FixedWindowRateLimiter } from "@/lib/rateLimit";

const ADMIN_ACTION_LIMIT = 60;
const ADMIN_ACTION_WINDOW_MS = 15 * 60 * 1000;

const adminRateLimiter = new FixedWindowRateLimiter(
  ADMIN_ACTION_LIMIT,
  ADMIN_ACTION_WINDOW_MS,
);

export function consumeAdminActionRateLimit(adminId: string) {
  return adminRateLimiter.consume(adminId);
}
