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
const updateUserRateLimiter = new FixedWindowRateLimiter(
  30,
  NOTIFICATION_READ_WINDOW_MS,
);
const updateIpRateLimiter = new FixedWindowRateLimiter(
  60,
  NOTIFICATION_READ_WINDOW_MS,
);

export const consumeNotificationReadUserRateLimit = (userId: string) =>
  userRateLimiter.consume(userId);

export const consumeNotificationReadIpRateLimit = (clientIp: string) =>
  ipRateLimiter.consume(clientIp);

export const consumeNotificationUpdateUserRateLimit = (userId: string) =>
  updateUserRateLimiter.consume(userId);

export const consumeNotificationUpdateIpRateLimit = (clientIp: string) =>
  updateIpRateLimiter.consume(clientIp);
