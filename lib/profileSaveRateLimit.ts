import { consumePersistentRateLimit } from "@/lib/persistentRateLimit";

const WINDOW_MS = 15 * 60 * 1000;
const PROFILE_SAVE_USER_LIMIT = 30;
const PROFILE_SAVE_IP_LIMIT = 100;
export const consumeProfileSaveUserRateLimit = (key: string) =>
  consumePersistentRateLimit({
    scope: "profile-save:user",
    key,
    limit: PROFILE_SAVE_USER_LIMIT,
    windowMs: WINDOW_MS,
  });
export const consumeProfileSaveIpRateLimit = (key: string) =>
  consumePersistentRateLimit({
    scope: "profile-save:ip",
    key,
    limit: PROFILE_SAVE_IP_LIMIT,
    windowMs: WINDOW_MS,
  });
