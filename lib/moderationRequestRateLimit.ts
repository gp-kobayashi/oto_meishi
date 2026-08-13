import { consumePersistentRateLimit } from "@/lib/persistentRateLimit";

const REQUEST_WINDOW_MS = 24 * 60 * 60 * 1000;
const USER_LIMIT = 5;
const IP_LIMIT = 15;

export const consumeModerationRequestUserRateLimit = (userId: string) =>
  consumePersistentRateLimit({
    scope: "moderation-request:user",
    key: userId,
    limit: USER_LIMIT,
    windowMs: REQUEST_WINDOW_MS,
  });

export const consumeModerationRequestIpRateLimit = (clientIp: string) =>
  consumePersistentRateLimit({
    scope: "moderation-request:ip",
    key: clientIp,
    limit: IP_LIMIT,
    windowMs: REQUEST_WINDOW_MS,
  });
