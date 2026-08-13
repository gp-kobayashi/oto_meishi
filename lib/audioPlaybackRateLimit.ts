import { consumePersistentRateLimit } from "@/lib/persistentRateLimit";

const PUBLIC_PLAYBACK_IP_LIMIT = 120;
const PLAYBACK_WINDOW_MS = 15 * 60 * 1000;
const ADMIN_PLAYBACK_LIMIT = 60;
const ADMIN_PLAYBACK_IP_LIMIT = 120;

export function consumePublicPlaybackIpRateLimit(clientIp: string) {
  return consumePersistentRateLimit({
    scope: "audio-playback:public-ip",
    key: clientIp,
    limit: PUBLIC_PLAYBACK_IP_LIMIT,
    windowMs: PLAYBACK_WINDOW_MS,
  });
}

export function consumeAdminPlaybackRateLimit(adminId: string) {
  return consumePersistentRateLimit({
    scope: "audio-playback:admin",
    key: adminId,
    limit: ADMIN_PLAYBACK_LIMIT,
    windowMs: PLAYBACK_WINDOW_MS,
  });
}

export function consumeAdminPlaybackIpRateLimit(clientIp: string) {
  return consumePersistentRateLimit({
    scope: "audio-playback:admin-ip",
    key: clientIp,
    limit: ADMIN_PLAYBACK_IP_LIMIT,
    windowMs: PLAYBACK_WINDOW_MS,
  });
}
