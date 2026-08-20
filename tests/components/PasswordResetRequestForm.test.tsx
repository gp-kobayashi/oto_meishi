import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PasswordResetRequestForm from "@/components/auth/PasswordResetRequestForm";

vi.mock("@/lib/supabaseClient", () => ({
  supabase: {
    auth: {
      resetPasswordForEmail: vi.fn(),
    },
  },
}));

import { supabase } from "@/lib/supabaseClient";

describe("PasswordResetRequestForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("再設定メールを指定したリダイレクト先で送信すること", async () => {
    const resetPasswordForEmail = vi.mocked(
      supabase!.auth.resetPasswordForEmail,
    );
    resetPasswordForEmail.mockResolvedValueOnce({
      data: {},
      error: null,
    });

    render(<PasswordResetRequestForm />);

    fireEvent.change(screen.getByLabelText("メールアドレス"), {
      target: { value: "test@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "再設定メールを送信" }));

    await waitFor(() => {
      expect(resetPasswordForEmail).toHaveBeenCalledWith("test@example.com", {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      expect(
        screen.getByText(
          "入力したメールアドレスが登録されている場合、パスワード再設定メールを送信しました。",
        ),
      ).toBeDefined();
    });
  });

  it("ユーザー未存在でも成功時と同じ表示にすること", async () => {
    const resetPasswordForEmail = vi.mocked(
      supabase!.auth.resetPasswordForEmail,
    );
    resetPasswordForEmail.mockResolvedValueOnce({
      data: null,
      error: {
        code: "user_not_found",
        status: 404,
        message: "user not found: test@example.com",
      },
    } as Awaited<ReturnType<typeof resetPasswordForEmail>>);

    render(<PasswordResetRequestForm />);

    fireEvent.change(screen.getByLabelText("メールアドレス"), {
      target: { value: "test@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "再設定メールを送信" }));

    const status = await screen.findByRole("status");
    expect(status.textContent).toBe(
      "入力したメールアドレスが登録されている場合、パスワード再設定メールを送信しました。",
    );
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByText("user not found: test@example.com")).toBeNull();
  });

  it("ユーザー未存在が例外として返っても成功表示にして記録しないこと", async () => {
    const resetPasswordForEmail = vi.mocked(
      supabase!.auth.resetPasswordForEmail,
    );
    resetPasswordForEmail.mockRejectedValueOnce({
      code: "user_not_found",
      status: 404,
      message: "user not found: test@example.com",
    });
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    render(<PasswordResetRequestForm />);
    fireEvent.change(screen.getByLabelText("メールアドレス"), {
      target: { value: "test@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "再設定メールを送信" }));

    const status = await screen.findByRole("status");
    expect(status.textContent).toBe(
      "入力したメールアドレスが登録されている場合、パスワード再設定メールを送信しました。",
    );
    expect(screen.queryByRole("alert")).toBeNull();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("運用エラーはrawメッセージを表示せず安全なログだけを記録すること", async () => {
    const resetPasswordForEmail = vi.mocked(
      supabase!.auth.resetPasswordForEmail,
    );
    resetPasswordForEmail.mockResolvedValueOnce({
      data: null,
      error: {
        code: "unexpected_failure",
        status: 500,
        message: "SMTP secret for test@example.com",
        stack: "password=secret",
      },
    } as Awaited<ReturnType<typeof resetPasswordForEmail>>);
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    render(<PasswordResetRequestForm />);
    fireEvent.change(screen.getByLabelText("メールアドレス"), {
      target: { value: "test@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "再設定メールを送信" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("認証に失敗しました");
    expect(alert.textContent).not.toContain("SMTP secret");
    expect(alert.textContent).not.toContain("test@example.com");
    expect(alert.textContent).not.toContain("password=secret");
    expect(consoleError).toHaveBeenCalledWith({
      context: "passwordResetRequest",
      code: "unexpected_failure",
      status: 500,
    });
  });

  it("送信中はボタンを無効にして多重送信を防ぐこと", async () => {
    const resetPasswordForEmail = vi.mocked(
      supabase!.auth.resetPasswordForEmail,
    );
    let resolveRequest!: (
      value: Awaited<ReturnType<typeof resetPasswordForEmail>>,
    ) => void;
    resetPasswordForEmail.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveRequest = resolve;
        }),
    );

    render(<PasswordResetRequestForm />);

    fireEvent.change(screen.getByLabelText("メールアドレス"), {
      target: { value: "test@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "再設定メールを送信" }));

    const pendingButton = await screen.findByRole<HTMLButtonElement>("button", {
      name: "送信中...",
    });
    expect(pendingButton.disabled).toBe(true);

    fireEvent.click(pendingButton);
    expect(resetPasswordForEmail).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveRequest({ data: {}, error: null });
    });
  });
});
