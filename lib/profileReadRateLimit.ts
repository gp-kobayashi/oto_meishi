import { FixedWindowRateLimiter } from "@/lib/rateLimit";

const PUBLIC_PROFILE_READ_IP_LIMIT = 300;
const PROFILE_READ_WINDOW_MS = 15 * 60 * 1000;
const PRIVATE_PROFILE_READ_USER_LIMIT = 120;

const publicIpRateLimiter = new FixedWindowRateLimiter(
  PUBLIC_PROFILE_READ_IP_LIMIT,
  PROFILE_READ_WINDOW_MS,
);
const privateUserRateLimiter = new FixedWindowRateLimiter(
  PRIVATE_PROFILE_READ_USER_LIMIT,
  PROFILE_READ_WINDOW_MS,
);

export function consumePublicProfileReadIpRateLimit(clientIp: string) {
  return publicIpRateLimiter.consume(clientIp);
}

export function consumePrivateProfileReadUserRateLimit(authenticatedUserId: string) {
  return privateUserRateLimiter.consume(authenticatedUserId);
}
