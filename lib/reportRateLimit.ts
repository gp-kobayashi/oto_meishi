import { consumePersistentRateLimit } from "@/lib/persistentRateLimit";

const WINDOW_MS = 15 * 60 * 1000;
const REPORT_IP_LIMIT = 10;
const REPORT_TARGET_LIMIT = 3;
export const consumeReportIpRateLimit = (key: string) =>
  consumePersistentRateLimit({
    scope: "report:ip",
    key,
    limit: REPORT_IP_LIMIT,
    windowMs: WINDOW_MS,
  });
export const consumeReportTargetRateLimit = (
  clientIp: string,
  targetType: "profile" | "audio" | "socialLink",
  targetId: string,
) =>
  consumePersistentRateLimit({
    scope: "report:target",
    key: `${clientIp}\u0000${targetType}:${targetId}`,
    limit: REPORT_TARGET_LIMIT,
    windowMs: 60 * 60 * 1000,
  });
