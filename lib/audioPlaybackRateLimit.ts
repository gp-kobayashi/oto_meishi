import { FixedWindowRateLimiter } from "@/lib/rateLimit";

const PUBLIC_PLAYBACK_IP_LIMIT = 120;
const PLAYBACK_WINDOW_MS = 15 * 60 * 1000;

const publicIpRateLimiter = new FixedWindowRateLimiter(
  PUBLIC_PLAYBACK_IP_LIMIT,
  PLAYBACK_WINDOW_MS,
);

export function consumePublicPlaybackIpRateLimit(clientIp: string) {
  return publicIpRateLimiter.consume(clientIp);
}
