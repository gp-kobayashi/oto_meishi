import { consumePersistentRateLimit } from "@/lib/persistentRateLimit";

const ADMIN_ACTION_LIMIT = 60;
const ADMIN_ACTION_WINDOW_MS = 15 * 60 * 1000;
const ADMIN_ACTION_IP_LIMIT = 120;

export function consumeAdminActionRateLimit(adminId: string) {
  return consumePersistentRateLimit({
    scope: "admin-action:admin",
    key: adminId,
    limit: ADMIN_ACTION_LIMIT,
    windowMs: ADMIN_ACTION_WINDOW_MS,
  });
}

export function consumeAdminActionIpRateLimit(clientIp: string) {
  return consumePersistentRateLimit({
    scope: "admin-action:ip",
    key: clientIp,
    limit: ADMIN_ACTION_IP_LIMIT,
    windowMs: ADMIN_ACTION_WINDOW_MS,
  });
}
