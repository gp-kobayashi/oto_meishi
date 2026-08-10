import { isIP } from "node:net";

function validIp(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  return isIP(normalized) ? normalized : null;
}

export function getTrustedClientIp(headers: Headers): string | null {
  const forwardedFor = headers.get("X-Forwarded-For");
  if (!forwardedFor) {
    return null;
  }

  // Google LBは既存値の後ろへclient-ip, load-balancer-ipの順で追加する。
  // クライアントが追加できる先頭側の値は信頼しない。
  const forwardedAddresses = forwardedFor.split(",");
  if (forwardedAddresses.length < 2) {
    return null;
  }

  const clientIp = validIp(forwardedAddresses.at(-2) ?? null);
  const loadBalancerIp = validIp(forwardedAddresses.at(-1) ?? null);
  return clientIp && loadBalancerIp ? clientIp : null;
}

export function getClientRateLimitKey(headers: Headers): string {
  return getTrustedClientIp(headers) ?? "unresolved-client";
}

// 既存のAPIルートではレート制限キーとしてのみ使用している。
export const getClientIp = getClientRateLimitKey;
