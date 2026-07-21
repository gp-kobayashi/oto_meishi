import { FixedWindowRateLimiter } from "@/lib/rateLimit";

const NOTIFICATION_READ_WINDOW_MS = 15 * 60 * 1000;
const userRateLimiter = new FixedWindowRateLimiter(
  60,
  NOTIFICATION_READ_WINDOW_MS,
);
const ipRateLimiter = new FixedWindowRateLimiter(
  120,
  NOTIFICATION_READ_WINDOW_MS,
);

export const consumeNotificationReadUserRateLimit = (userId: string) =>
  userRateLimiter.consume(userId);

export const consumeNotificationReadIpRateLimit = (clientIp: string) =>
  ipRateLimiter.consume(clientIp);
