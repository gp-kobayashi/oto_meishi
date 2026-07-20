import { describe, expect, it } from "vitest";
import { securityHeaders } from "@/next.config";

describe("securityHeaders", () => {
  it("すべての画面に基本的なセキュリティヘッダーを設定する", () => {
    expect(Object.fromEntries(
      securityHeaders.map(({ key, value }) => [key, value]),
    )).toEqual({
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "Permissions-Policy":
        "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()",
    });
  });
});
