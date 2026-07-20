import { describe, expect, it } from "vitest";
import { contentSecurityPolicy, securityHeaders } from "@/next.config";

describe("securityHeaders", () => {
  it("すべての画面に基本的なセキュリティヘッダーを設定する", () => {
    expect(Object.fromEntries(
      securityHeaders.map(({ key, value }) => [key, value]),
    )).toEqual({
      "Content-Security-Policy": contentSecurityPolicy,
      "X-Content-Type-Options": "nosniff",
      "Strict-Transport-Security": "max-age=31536000",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "Permissions-Policy":
        "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()",
    });
  });

  it("CSPをレポート専用ではなく強制モードで設定する", () => {
    const headerNames = securityHeaders.map(({ key }) => key);

    expect(headerNames).toContain("Content-Security-Policy");
    expect(headerNames).not.toContain("Content-Security-Policy-Report-Only");
  });

  it("CSPで必要な通信先だけを許可する", () => {
    expect(contentSecurityPolicy).toContain("default-src 'self'");
    expect(contentSecurityPolicy).toContain(
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
    );
    expect(contentSecurityPolicy).toContain(
      "media-src 'self' blob: https://*.r2.cloudflarestorage.com",
    );
    expect(contentSecurityPolicy).toContain("object-src 'none'");
    expect(contentSecurityPolicy).toContain("base-uri 'self'");
    expect(contentSecurityPolicy).toContain("form-action 'self'");
    expect(contentSecurityPolicy).toContain("frame-ancestors 'none'");
  });
});
