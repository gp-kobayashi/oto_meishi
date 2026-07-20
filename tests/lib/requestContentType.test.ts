import { describe, expect, it } from "vitest";
import { hasJsonContentType } from "@/lib/requestContentType";

function requestWithContentType(contentType?: string) {
  const headers = contentType ? { "Content-Type": contentType } : undefined;
  return new Request("http://localhost/api/test", { headers });
}

describe("hasJsonContentType", () => {
  it("application/jsonを許可する", () => {
    expect(hasJsonContentType(requestWithContentType("application/json"))).toBe(
      true,
    );
  });

  it("大文字小文字やcharsetの違いを許可する", () => {
    expect(
      hasJsonContentType(
        requestWithContentType("Application/JSON; charset=utf-8"),
      ),
    ).toBe(true);
  });

  it.each([undefined, "text/plain", "application/problem+json"])(
    "%sを拒否する",
    (contentType) => {
      expect(hasJsonContentType(requestWithContentType(contentType))).toBe(false);
    },
  );
});
