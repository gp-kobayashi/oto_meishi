import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import LogoutPage from "@/app/(site)/logout/page";
import { supabase } from "@/lib/supabaseClient";
import { OTO_MEISHI_USER_ID_KEY } from "@/lib/storageKeys";

const replace = vi.fn();
const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, refresh }),
}));

vi.mock("@/lib/supabaseClient", () => ({
  supabase: {
    auth: {
      signOut: vi.fn(),
    },
  },
}));

describe("LogoutPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  it("ログアウト後にユーザーIDを削除してログイン画面へ遷移する", async () => {
    const signOut = vi.mocked(supabase!.auth.signOut);
    signOut.mockResolvedValueOnce({ error: null });
    window.localStorage.setItem(OTO_MEISHI_USER_ID_KEY, "testuser");

    render(<LogoutPage />);
    fireEvent.click(screen.getByRole("button", { name: "ログアウトする" }));

    await waitFor(() => {
      expect(signOut).toHaveBeenCalledWith({ scope: "local" });
      expect(window.localStorage.getItem(OTO_MEISHI_USER_ID_KEY)).toBeNull();
      expect(replace).toHaveBeenCalledWith("/login");
      expect(refresh).toHaveBeenCalledOnce();
    });
  });

  it("ログアウトに失敗した場合はエラーを表示してユーザー情報を保持する", async () => {
    const signOut = vi.mocked(supabase!.auth.signOut);
    signOut.mockResolvedValueOnce({
      error: new Error("ログアウトエラー"),
    } as Awaited<ReturnType<typeof signOut>>);
    window.localStorage.setItem(OTO_MEISHI_USER_ID_KEY, "testuser");

    render(<LogoutPage />);
    fireEvent.click(screen.getByRole("button", { name: "ログアウトする" }));

    expect((await screen.findByRole("alert")).textContent).toContain(
      "ログアウトエラー",
    );
    expect(window.localStorage.getItem(OTO_MEISHI_USER_ID_KEY)).toBe(
      "testuser",
    );
    expect(replace).not.toHaveBeenCalled();
  });
});
