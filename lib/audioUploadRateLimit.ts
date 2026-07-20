import { FixedWindowRateLimiter } from "@/lib/rateLimit";

const AUDIO_UPLOAD_LIMIT = 10;
const AUDIO_UPLOAD_WINDOW_MS = 15 * 60 * 1000;

const userRateLimiter = new FixedWindowRateLimiter(
  AUDIO_UPLOAD_LIMIT,
  AUDIO_UPLOAD_WINDOW_MS,
);

export function consumeAudioUploadUserRateLimit(authenticatedUserId: string) {
  return userRateLimiter.consume(authenticatedUserId);
}
