import { FixedWindowRateLimiter } from "@/lib/rateLimit";
import { consumePersistentRateLimit } from "@/lib/persistentRateLimit";

const NOTIFICATION_READ_WINDOW_MS = 15 * 60 * 1000;
const userRateLimiter = new FixedWindowRateLimiter(
  60,
  NOTIFICATION_READ_WINDOW_MS,
);
const ipRateLimiter = new FixedWindowRateLimiter(
  120,
  NOTIFICATION_READ_WINDOW_MS,
);
const NOTIFICATION_UPDATE_USER_LIMIT = 30;
const NOTIFICATION_UPDATE_IP_LIMIT = 60;

export const consumeNotificationReadUserRateLimit = (userId: string) =>
  userRateLimiter.consume(userId);

export const consumeNotificationReadIpRateLimit = (clientIp: string) =>
  ipRateLimiter.consume(clientIp);

export const consumeNotificationUpdateUserRateLimit = (userId: string) =>
  consumePersistentRateLimit({
    scope: "notification-update:user",
    key: userId,
    limit: NOTIFICATION_UPDATE_USER_LIMIT,
    windowMs: NOTIFICATION_READ_WINDOW_MS,
  });

export const consumeNotificationUpdateIpRateLimit = (clientIp: string) =>
  consumePersistentRateLimit({
    scope: "notification-update:ip",
    key: clientIp,
    limit: NOTIFICATION_UPDATE_IP_LIMIT,
    windowMs: NOTIFICATION_READ_WINDOW_MS,
  });
