import { FixedWindowRateLimiter } from "@/lib/rateLimit";

const REQUEST_WINDOW_MS = 24 * 60 * 60 * 1000;
const userRateLimiter = new FixedWindowRateLimiter(5, REQUEST_WINDOW_MS);
const ipRateLimiter = new FixedWindowRateLimiter(15, REQUEST_WINDOW_MS);

export const consumeModerationRequestUserRateLimit = (userId: string) =>
  userRateLimiter.consume(userId);

export const consumeModerationRequestIpRateLimit = (clientIp: string) =>
  ipRateLimiter.consume(clientIp);
