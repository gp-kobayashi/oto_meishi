import { describe, expect, it } from "vitest";
import {
  createPublicReportToken,
  verifyPublicReportToken,
} from "@/lib/publicReportToken";

describe("公開通報トークン", () => {
  it("発行したトークンを対象プロフィールに限って検証する", () => {
    const now = Date.parse("2026-09-02T00:00:00.000Z");
    const token = createPublicReportToken("profile-1", now);

    expect(verifyPublicReportToken(token, "profile-1", now)).toBe(true);
    expect(verifyPublicReportToken(token, "profile-2", now)).toBe(false);
  });

  it("改ざん・期限切れトークンを拒否する", () => {
    const now = Date.parse("2026-09-02T00:00:00.000Z");
    const token = createPublicReportToken("profile-1", now);

    expect(verifyPublicReportToken(`${token}x`, "profile-1", now)).toBe(false);
    expect(
      verifyPublicReportToken(token, "profile-1", now + 11 * 60 * 1000),
    ).toBe(false);
  });
});
