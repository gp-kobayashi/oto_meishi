import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  act,
  render,
  screen,
  fireEvent,
  waitFor,
} from "@testing-library/react";
import AuthPanel from "@/components/auth/AuthPanel";
import React from "react";

const { replaceMock } = vi.hoisted(() => ({
  replaceMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: replaceMock,
  }),
}));

// supabaseClientのモック
vi.mock("@/lib/supabaseClient", () => {
  return {
    supabase: {
      auth: {
        signUp: vi.fn(),
        signInWithPassword: vi.fn(),
        signInWithOAuth: vi.fn(),
      },
    },
  };
});

import { supabase } from "@/lib/supabaseClient";

describe("AuthPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("ログインモードで正しくレンダリングされること", () => {
    render(<AuthPanel mode="login" />);

    expect(
      screen.getByRole("button", { name: /Googleアカウントでログイン/i }),
    ).toBeDefined();
    expect(
      screen.getByRole("button", { name: /Facebookアカウントでログイン/i }),
    ).toBeDefined();
    expect(screen.getByLabelText("メールアドレス")).toBeDefined();
    expect(screen.getByLabelText("パスワード")).toBeDefined();
    expect(
      screen.getByRole("button", { name: "メールアドレスでログイン" }),
    ).toBeDefined();
    expect(
      screen
        .getByRole("link", { name: "パスワードをお忘れですか？" })
        .getAttribute("href"),
    ).toBe("/forgot-password");
  });

  it("メールアドレスとパスワードによるログインが成功すること", async () => {
    const mockSignIn = vi.mocked(supabase!.auth.signInWithPassword);
    mockSignIn.mockResolvedValueOnce({
      data: { user: {} },
      error: null,
    } as Awaited<ReturnType<typeof mockSignIn>>);

    render(<AuthPanel mode="login" />);

    fireEvent.change(screen.getByLabelText("メールアドレス"), {
      target: { value: "test@example.com" },
    });
    fireEvent.change(screen.getByLabelText("パスワード"), {
      target: { value: "password123" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "メールアドレスでログイン" }),
    );

    await waitFor(() => {
      expect(mockSignIn).toHaveBeenCalledWith({
        email: "test@example.com",
        password: "password123",
      });
      expect(replaceMock).toHaveBeenCalledWith("/profile");
    });
  });

  it.each(["invalid_credentials", "user_not_found", "email_not_confirmed"])(
    "ログインの%sを存在非識別メッセージにすること",
    async (code) => {
      const mockSignIn = vi.mocked(supabase!.auth.signInWithPassword);
      mockSignIn.mockResolvedValueOnce({
        data: { user: null, session: null },
        error: {
          code,
          status: 400,
          message: "Invalid credentials: internal details",
        },
      } as Awaited<ReturnType<typeof mockSignIn>>);
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);

      render(<AuthPanel mode="login" />);

      fireEvent.change(screen.getByLabelText("メールアドレス"), {
        target: { value: "test@example.com" },
      });
      fireEvent.change(screen.getByLabelText("パスワード"), {
        target: { value: "wrongpass" },
      });
      fireEvent.click(
        screen.getByRole("button", { name: "メールアドレスでログイン" }),
      );

      await waitFor(() => {
        expect(
          screen.getByText(
            "メールアドレスまたはパスワードが正しくありません。",
          ),
        ).toBeDefined();
        expect(
          screen.queryByText("Invalid credentials: internal details"),
        ).toBeNull();
        expect(replaceMock).not.toHaveBeenCalled();
        expect(consoleError).toHaveBeenCalledWith(
          expect.objectContaining({
            context: "login",
            code,
            status: 400,
          }),
        );
      });
    },
  );

  it("メールログイン処理中は送信ボタンを無効にして多重送信を防ぐこと", async () => {
    const mockSignIn = vi.mocked(supabase!.auth.signInWithPassword);
    let resolveSignIn!: (value: Awaited<ReturnType<typeof mockSignIn>>) => void;
    mockSignIn.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveSignIn = resolve;
        }),
    );

    render(<AuthPanel mode="login" />);

    fireEvent.change(screen.getByLabelText("メールアドレス"), {
      target: { value: "test@example.com" },
    });
    fireEvent.change(screen.getByLabelText("パスワード"), {
      target: { value: "password123" },
    });
    const submitButton = screen.getByRole<HTMLButtonElement>("button", {
      name: "メールアドレスでログイン",
    });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(
        screen.getByRole<HTMLButtonElement>("button", { name: "処理中..." })
          .disabled,
      ).toBe(true);
    });

    fireEvent.click(
      screen.getByRole<HTMLButtonElement>("button", { name: "処理中..." }),
    );
    expect(mockSignIn).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveSignIn({
        data: { user: {} },
        error: null,
      } as Awaited<ReturnType<typeof mockSignIn>>);
    });

    expect(replaceMock).toHaveBeenCalledWith("/profile");
  });

  it("Googleログイン時にアカウント選択画面を要求すること", async () => {
    const mockSignInWithOAuth = vi.mocked(supabase!.auth.signInWithOAuth);
    mockSignInWithOAuth.mockResolvedValueOnce({
      data: { provider: "google", url: null },
      error: null,
    } as unknown as Awaited<ReturnType<typeof mockSignInWithOAuth>>);

    render(<AuthPanel mode="login" />);
    fireEvent.click(
      screen.getByRole("button", { name: "Googleアカウントでログイン" }),
    );

    await waitFor(() => {
      expect(mockSignInWithOAuth).toHaveBeenCalledWith({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/profile`,
          queryParams: { prompt: "select_account" },
        },
      });
      expect(replaceMock).not.toHaveBeenCalled();
    });
  });

  it("Facebookログイン時にプロフィール画面をコールバック先にすること", async () => {
    const mockSignInWithOAuth = vi.mocked(supabase!.auth.signInWithOAuth);
    mockSignInWithOAuth.mockResolvedValueOnce({
      data: { provider: "facebook", url: null },
      error: null,
    } as unknown as Awaited<ReturnType<typeof mockSignInWithOAuth>>);

    render(<AuthPanel mode="login" />);
    fireEvent.click(
      screen.getByRole("button", { name: "Facebookアカウントでログイン" }),
    );

    await waitFor(() => {
      expect(mockSignInWithOAuth).toHaveBeenCalledWith({
        provider: "facebook",
        options: {
          redirectTo: `${window.location.origin}/profile`,
          queryParams: undefined,
        },
      });
      expect(replaceMock).not.toHaveBeenCalled();
    });
  });

  it("OAuth失敗時にrawメッセージを表示・記録しないこと", async () => {
    const mockSignInWithOAuth = vi.mocked(supabase!.auth.signInWithOAuth);
    mockSignInWithOAuth.mockResolvedValueOnce({
      data: { provider: "google", url: null },
      error: {
        code: "bad_oauth_callback",
        status: 400,
        message: "OAuth provider internal secret",
      },
    } as unknown as Awaited<ReturnType<typeof mockSignInWithOAuth>>);
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    render(<AuthPanel mode="login" />);
    fireEvent.click(
      screen.getByRole("button", { name: "Googleアカウントでログイン" }),
    );

    await waitFor(() => {
      expect(
        screen.getByText(
          "外部サービスでの認証に失敗しました。もう一度お試しください。",
        ),
      ).toBeDefined();
      expect(screen.queryByText("OAuth provider internal secret")).toBeNull();
      expect(consoleError).toHaveBeenCalledWith(
        expect.objectContaining({
          context: "oauth",
          code: "bad_oauth_callback",
          status: 400,
        }),
      );
    });
  });

  it("新規登録モードで正しく動作すること", async () => {
    const mockSignUp = vi.mocked(supabase!.auth.signUp);
    mockSignUp.mockResolvedValueOnce({
      data: { user: {} },
      error: null,
    } as Awaited<ReturnType<typeof mockSignUp>>);

    render(<AuthPanel mode="signup" />);

    expect(
      screen.getByRole("button", { name: "メールアドレスで登録" }),
    ).toBeDefined();
    expect(
      screen.getByRole("link", { name: "利用規約" }).getAttribute("href"),
    ).toBe("/terms");
    expect(
      screen
        .getByRole("link", { name: "プライバシーポリシー" })
        .getAttribute("href"),
    ).toBe("/privacy");

    fireEvent.change(screen.getByLabelText("メールアドレス"), {
      target: { value: "new@example.com" },
    });
    fireEvent.change(screen.getByLabelText("パスワード"), {
      target: { value: "securepass" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "メールアドレスで登録" }),
    );

    await waitFor(() => {
      expect(mockSignUp).toHaveBeenCalledWith({
        email: "new@example.com",
        password: "securepass",
      });
      expect(screen.getByText(/確認メールを送信しました/)).toBeDefined();
    });
  });

  it.each(["user_already_exists", "email_exists"])(
    "登録時に%sを存在非識別メッセージにすること",
    async (code) => {
      const mockSignUp = vi.mocked(supabase!.auth.signUp);
      mockSignUp.mockResolvedValueOnce({
        data: { user: null },
        error: {
          code,
          status: 400,
          message: "email already exists: test@example.com",
        },
      } as Awaited<ReturnType<typeof mockSignUp>>);
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);

      render(<AuthPanel mode="signup" />);
      fireEvent.change(screen.getByLabelText("メールアドレス"), {
        target: { value: "test@example.com" },
      });
      fireEvent.change(screen.getByLabelText("パスワード"), {
        target: { value: "securepass" },
      });
      fireEvent.click(
        screen.getByRole("button", { name: "メールアドレスで登録" }),
      );

      await waitFor(() => {
        expect(
          screen.getByText(
            "登録を完了できませんでした。入力内容を確認して、もう一度お試しください。",
          ),
        ).toBeDefined();
        expect(
          screen.queryByText("email already exists: test@example.com"),
        ).toBeNull();
        expect(screen.getByRole("alert").textContent).not.toContain(
          "test@example.com",
        );
        expect(consoleError).toHaveBeenCalledWith(
          expect.objectContaining({ context: "signup", code, status: 400 }),
        );
      });
    },
  );
});
