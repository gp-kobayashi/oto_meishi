import { consumePersistentRateLimit } from "@/lib/persistentRateLimit";

const WINDOW_MS = 15 * 60 * 1000;
const AUDIO_UPLOAD_USER_LIMIT = 10;
const AUDIO_UPLOAD_IP_LIMIT = 30;
export const consumeAudioUploadUserRateLimit = (key: string) =>
  consumePersistentRateLimit({
    scope: "audio-upload:user",
    key,
    limit: AUDIO_UPLOAD_USER_LIMIT,
    windowMs: WINDOW_MS,
  });
export const consumeAudioUploadIpRateLimit = (key: string) =>
  consumePersistentRateLimit({
    scope: "audio-upload:ip",
    key,
    limit: AUDIO_UPLOAD_IP_LIMIT,
    windowMs: WINDOW_MS,
  });
