import { describe, expect, it } from "vitest";
import { isReservedUserId } from "@/lib/userIdPolicy";

describe("ユーザーID予約語ポリシー", () => {
  it("すべての予約済みユーザーIDを拒否する", () => {
    const reservedUserIds = [
      "admin",
      "api",
      "forgot-password",
      "help",
      "login",
      "logout",
      "privacy",
      "profile",
      "reset-password",
      "signup",
      "support",
      "terms",
      "useridInput",
      "_next",
    ];

    for (const userId of reservedUserIds) {
      expect(isReservedUserId(userId)).toBe(true);
    }
  });

  it("大文字小文字と前後の空白を正規化して判定する", () => {
    expect(isReservedUserId("Admin")).toBe(true);
    expect(isReservedUserId("PROFILE")).toBe(true);
    expect(isReservedUserId(" _NEXT ")).toBe(true);
  });

  it("予約されていないユーザーIDは許可する", () => {
    expect(isReservedUserId("my-profile")).toBe(false);
    expect(isReservedUserId("user_123")).toBe(false);
  });
});
