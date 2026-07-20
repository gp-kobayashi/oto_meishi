import { FixedWindowRateLimiter } from "@/lib/rateLimit";

const AUDIO_UPLOAD_LIMIT = 10;
const AUDIO_UPLOAD_WINDOW_MS = 15 * 60 * 1000;
const AUDIO_UPLOAD_IP_LIMIT = 30;

const userRateLimiter = new FixedWindowRateLimiter(
  AUDIO_UPLOAD_LIMIT,
  AUDIO_UPLOAD_WINDOW_MS,
);
const ipRateLimiter = new FixedWindowRateLimiter(
  AUDIO_UPLOAD_IP_LIMIT,
  AUDIO_UPLOAD_WINDOW_MS,
);

export function consumeAudioUploadUserRateLimit(authenticatedUserId: string) {
  return userRateLimiter.consume(authenticatedUserId);
}

export function consumeAudioUploadIpRateLimit(clientIp: string) {
  return ipRateLimiter.consume(clientIp);
}
