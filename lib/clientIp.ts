import { isIP } from "node:net";

function validIp(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  return isIP(normalized) ? normalized : null;
}

export function getClientIp(headers: Headers): string | null {
  const cloudflareIp = validIp(headers.get("CF-Connecting-IP"));
  if (cloudflareIp) {
    return cloudflareIp;
  }

  const forwardedFor = headers.get("X-Forwarded-For");
  if (!forwardedFor) {
    return null;
  }

  return validIp(forwardedFor.split(",", 1)[0]);
}
