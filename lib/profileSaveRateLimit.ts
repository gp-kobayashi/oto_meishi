import { FixedWindowRateLimiter } from "@/lib/rateLimit";

const PROFILE_SAVE_USER_LIMIT = 30;
const PROFILE_SAVE_WINDOW_MS = 15 * 60 * 1000;
const PROFILE_SAVE_IP_LIMIT = 100;

const userRateLimiter = new FixedWindowRateLimiter(
  PROFILE_SAVE_USER_LIMIT,
  PROFILE_SAVE_WINDOW_MS,
);
const ipRateLimiter = new FixedWindowRateLimiter(
  PROFILE_SAVE_IP_LIMIT,
  PROFILE_SAVE_WINDOW_MS,
);

export function consumeProfileSaveUserRateLimit(authenticatedUserId: string) {
  return userRateLimiter.consume(authenticatedUserId);
}

export function consumeProfileSaveIpRateLimit(clientIp: string) {
  return ipRateLimiter.consume(clientIp);
}
