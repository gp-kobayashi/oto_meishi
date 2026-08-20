import { describe, expect, it } from "vitest";
import { getAuthErrorPresentation } from "@/lib/authErrorMessages";

describe("getAuthErrorPresentation", () => {
  it.each(["invalid_credentials", "user_not_found", "email_not_confirmed"])(
    "ログインの%sを同じメッセージにすること",
    (code) => {
      const result = getAuthErrorPresentation(
        { code, status: 400, message: "内部情報" },
        "login",
      );

      expect(result.message).toBe(
        "メールアドレスまたはパスワードが正しくありません。",
      );
      expect(result.kind).toBe("error");
    },
  );

  it.each([429, 400])("レート制限を待機メッセージにすること", (status) => {
    const result = getAuthErrorPresentation(
      { code: status === 429 ? "unknown" : "over_custom_rate_limit", status },
      "login",
    );

    expect(result.message).toBe("時間をおいてから、もう一度お試しください。");
  });

  it("パスワード再設定のユーザー未存在だけを成功表示にすること", () => {
    const result = getAuthErrorPresentation(
      { code: "user_not_found", status: 404 },
      "passwordResetRequest",
    );

    expect(result.kind).toBe("success");
    expect(result.message).toContain("登録されている場合");
    expect(result.retryable).toBe(false);

    for (const code of ["email_address_not_authorized", "email_not_found"]) {
      const unknownResult = getAuthErrorPresentation(
        { code, status: 400 },
        "passwordResetRequest",
      );

      expect(unknownResult.kind).toBe("error");
      expect(unknownResult.message).not.toContain("登録されている場合");
    }
  });

  it("パスワード更新のセッションエラーを再ログイン案内にすること", () => {
    const result = getAuthErrorPresentation(
      { code: "session_expired", status: 401 },
      "passwordUpdate",
    );

    expect(result.message).toContain("もう一度ログイン");
    expect(result.retryable).toBe(false);
  });

  it("登録・OAuth・弱いパスワードを安全なメッセージにすること", () => {
    expect(
      getAuthErrorPresentation({ code: "weak_password" }, "signup").message,
    ).toContain("安全性");
    for (const code of ["user_already_exists", "email_exists"]) {
      const result = getAuthErrorPresentation({ code }, "signup");

      expect(result.message).toContain("登録を完了できませんでした");
      expect(result.message).not.toContain("すでに登録");
    }
    expect(
      getAuthErrorPresentation({ code: "bad_oauth_callback" }, "oauth").message,
    ).toContain("外部サービス");
  });

  it.each([
    undefined,
    null,
    "認証内部メッセージ",
    new Error("認証内部メッセージ"),
    { message: "認証内部メッセージ", stack: "秘密のスタック" },
  ])("未知の入力でもraw値を返さないこと: %p", (error) => {
    const result = getAuthErrorPresentation(error, "login");

    expect(result.message).not.toContain("認証内部メッセージ");
    expect(result.message).not.toContain("秘密のスタック");
    expect(result.logContext).not.toHaveProperty("message");
    expect(result.logContext).not.toHaveProperty("stack");
  });

  it("ログ用コンテキストにはコード・状態・名前だけを含めること", () => {
    const result = getAuthErrorPresentation(
      {
        name: "AuthApiError",
        code: "invalid_credentials",
        status: 400,
        message: "メールアドレス=test@example.com",
        stack: "password=secret",
      },
      "login",
    );

    expect(result.logContext).toEqual({
      context: "login",
      name: "AuthApiError",
      code: "invalid_credentials",
      status: 400,
    });
  });
});
