import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PasswordResetForm from "@/components/auth/PasswordResetForm";

vi.mock("@/lib/supabaseClient", () => ({
  supabase: {
    auth: {
      updateUser: vi.fn(),
    },
  },
}));

import { supabase } from "@/lib/supabaseClient";

const enterPasswords = (password: string, confirmation: string) => {
  fireEvent.change(screen.getByLabelText("新しいパスワード"), {
    target: { value: password },
  });
  fireEvent.change(screen.getByLabelText("新しいパスワード（確認）"), {
    target: { value: confirmation },
  });
};

describe("PasswordResetForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("一致する新しいパスワードでユーザーを更新すること", async () => {
    const updateUser = vi.mocked(supabase!.auth.updateUser);
    updateUser.mockResolvedValueOnce({
      data: { user: {} },
      error: null,
    } as Awaited<ReturnType<typeof updateUser>>);

    render(<PasswordResetForm />);
    enterPasswords("new-password", "new-password");
    fireEvent.click(screen.getByRole("button", { name: "パスワードを更新" }));

    await waitFor(() => {
      expect(updateUser).toHaveBeenCalledWith({ password: "new-password" });
      expect(
        screen.getByText(
          "パスワードを更新しました。新しいパスワードでログインできます。",
        ),
      ).toBeDefined();
    });
  });

  it("確認用パスワードが一致しない場合は更新しないこと", () => {
    const updateUser = vi.mocked(supabase!.auth.updateUser);

    render(<PasswordResetForm />);
    enterPasswords("new-password", "other-password");
    fireEvent.click(screen.getByRole("button", { name: "パスワードを更新" }));

    expect(screen.getByRole("alert").textContent).toBe(
      "確認用パスワードが一致しません。",
    );
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("更新失敗時にエラーメッセージを表示すること", async () => {
    const updateUser = vi.mocked(supabase!.auth.updateUser);
    updateUser.mockResolvedValueOnce({
      data: { user: null },
      error: {
        code: "session_expired",
        status: 401,
        message: "reset token internal details",
        stack: "password=secret",
      },
    } as Awaited<ReturnType<typeof updateUser>>);
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    render(<PasswordResetForm />);
    enterPasswords("new-password", "new-password");
    fireEvent.click(screen.getByRole("button", { name: "パスワードを更新" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe(
      "セッションの有効期限が切れました。もう一度ログインしてください。",
    );
    expect(alert.textContent).not.toContain("reset token internal details");
    expect(alert.textContent).not.toContain("password=secret");
    expect(consoleError).toHaveBeenCalledWith({
      context: "passwordUpdate",
      code: "session_expired",
      status: 401,
    });
  });

  it("弱いパスワードを安全な日本語メッセージにすること", async () => {
    const updateUser = vi.mocked(supabase!.auth.updateUser);
    updateUser.mockResolvedValueOnce({
      data: { user: null },
      error: {
        code: "weak_password",
        status: 400,
        message: "weak password details",
      },
    } as Awaited<ReturnType<typeof updateUser>>);
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    render(<PasswordResetForm />);
    enterPasswords("new-password", "new-password");
    fireEvent.click(screen.getByRole("button", { name: "パスワードを更新" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("安全性");
    expect(alert.textContent).not.toContain("weak password details");
  });

  it("更新中はボタンを無効にして多重送信を防ぐこと", async () => {
    const updateUser = vi.mocked(supabase!.auth.updateUser);
    let resolveUpdate!: (value: Awaited<ReturnType<typeof updateUser>>) => void;
    updateUser.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveUpdate = resolve;
        }),
    );

    render(<PasswordResetForm />);
    enterPasswords("new-password", "new-password");
    fireEvent.click(screen.getByRole("button", { name: "パスワードを更新" }));

    const pendingButton = await screen.findByRole<HTMLButtonElement>("button", {
      name: "更新中...",
    });
    expect(pendingButton.disabled).toBe(true);

    fireEvent.click(pendingButton);
    expect(updateUser).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveUpdate({
        data: { user: {} },
        error: null,
      } as Awaited<ReturnType<typeof updateUser>>);
    });
  });
});
