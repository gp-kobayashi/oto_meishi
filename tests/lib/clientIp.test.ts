import { describe, expect, it } from "vitest";
import { getClientIp } from "@/lib/clientIp";

describe("getClientIp", () => {
  it("Cloudflareの接続元IPを優先する", () => {
    const headers = new Headers({
      "CF-Connecting-IP": "203.0.113.10",
      "X-Forwarded-For": "198.51.100.20, 10.0.0.1",
    });

    expect(getClientIp(headers)).toBe("203.0.113.10");
  });

  it("Cloudflareの値がない場合は転送元の先頭IPを使う", () => {
    const headers = new Headers({
      "X-Forwarded-For": "198.51.100.20, 10.0.0.1",
    });

    expect(getClientIp(headers)).toBe("198.51.100.20");
  });

  it("IPv6を受け付けて小文字に統一する", () => {
    const headers = new Headers({ "CF-Connecting-IP": "2001:DB8::1" });

    expect(getClientIp(headers)).toBe("2001:db8::1");
  });

  it("有効なIPがない場合はnullを返す", () => {
    expect(
      getClientIp(new Headers({ "X-Forwarded-For": "unknown, 10.0.0.1" })),
    ).toBeNull();
    expect(getClientIp(new Headers())).toBeNull();
  });
});
