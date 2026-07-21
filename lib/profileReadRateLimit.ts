import { FixedWindowRateLimiter } from "@/lib/rateLimit";

const PUBLIC_PROFILE_READ_IP_LIMIT = 300;
const PROFILE_READ_WINDOW_MS = 15 * 60 * 1000;

const publicIpRateLimiter = new FixedWindowRateLimiter(
  PUBLIC_PROFILE_READ_IP_LIMIT,
  PROFILE_READ_WINDOW_MS,
);

export function consumePublicProfileReadIpRateLimit(clientIp: string) {
  return publicIpRateLimiter.consume(clientIp);
}
