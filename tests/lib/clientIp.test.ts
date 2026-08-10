import { describe, expect, it } from "vitest";
import {
  getClientRateLimitKey,
  getTrustedClientIp,
} from "@/lib/clientIp";

describe("getClientIp", () => {
  it("クライアント指定ヘッダーを無視してGoogle LBが追加した接続元IPを使う", () => {
    const headers = new Headers({
      "CF-Connecting-IP": "203.0.113.10",
      "X-Forwarded-For": "192.0.2.30, 198.51.100.20, 10.0.0.1",
    });

    expect(getTrustedClientIp(headers)).toBe("198.51.100.20");
  });

  it("検証不能な既存XFF値があってもGoogle LBが追加した末尾2件を使う", () => {
    const headers = new Headers({
      "X-Forwarded-For": "unknown, 198.51.100.20, 10.0.0.1",
    });

    expect(getTrustedClientIp(headers)).toBe("198.51.100.20");
  });

  it("IPv6を受け付けて小文字に統一する", () => {
    const headers = new Headers({
      "X-Forwarded-For": "2001:DB8::1, 2001:DB8::2",
    });

    expect(getTrustedClientIp(headers)).toBe("2001:db8::1");
  });

  it("信頼できる2件のIPが揃わない場合はnullを返す", () => {
    expect(getTrustedClientIp(
      new Headers({ "X-Forwarded-For": "203.0.113.10" }),
    )).toBeNull();
    expect(getTrustedClientIp(new Headers({
      "X-Forwarded-For": "unknown, 10.0.0.1",
    }))).toBeNull();
    expect(getTrustedClientIp(new Headers())).toBeNull();
  });

  it("IPを検証できない場合も共通キーでレート制限する", () => {
    expect(getClientRateLimitKey(new Headers())).toBe("unresolved-client");
    expect(getClientRateLimitKey(new Headers({
      "CF-Connecting-IP": "203.0.113.10",
    }))).toBe("unresolved-client");
  });
});
