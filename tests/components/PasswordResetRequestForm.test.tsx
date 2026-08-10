import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AuthError } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
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
    fireEvent.click(
      screen.getByRole("button", { name: "再設定メールを送信" }),
    );

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

  it("送信失敗時にエラーメッセージを表示すること", async () => {
    const resetPasswordForEmail = vi.mocked(
      supabase!.auth.resetPasswordForEmail,
    );
    resetPasswordForEmail.mockResolvedValueOnce({
      data: null,
      error: new AuthError("メールを送信できませんでした。"),
    });

    render(<PasswordResetRequestForm />);

    fireEvent.change(screen.getByLabelText("メールアドレス"), {
      target: { value: "test@example.com" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "再設定メールを送信" }),
    );

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("メールを送信できませんでした。");
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
    fireEvent.click(
      screen.getByRole("button", { name: "再設定メールを送信" }),
    );

    const pendingButton = await screen.findByRole<HTMLButtonElement>(
      "button",
      { name: "送信中..." },
    );
    expect(pendingButton.disabled).toBe(true);

    fireEvent.click(pendingButton);
    expect(resetPasswordForEmail).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveRequest({ data: {}, error: null });
    });
  });
});
