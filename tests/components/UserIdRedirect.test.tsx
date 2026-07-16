import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import UserIdRedirect from "@/components/auth/UserIdRedirect";
import { supabase } from "@/lib/supabaseClient";
import { OTO_MEISHI_USER_ID_KEY } from "@/lib/storageKeys";

const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
}));

vi.mock("@/lib/supabaseClient", () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
    },
  },
}));

describe("UserIdRedirect", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    vi.stubGlobal("fetch", vi.fn());
  });

  it("プロフィール未作成ならユーザーID入力ページへ遷移する", async () => {
    const getSession = vi.mocked(supabase!.auth.getSession);
    getSession.mockResolvedValueOnce({
      data: {
        session: { access_token: "test-token" },
      },
      error: null,
    } as Awaited<ReturnType<typeof getSession>>);
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "profile not found" }), {
        status: 404,
      }),
    );

    render(<UserIdRedirect />);

    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith("/useridInput");
    });
    expect(fetch).toHaveBeenCalledWith("/api/profile?mine=true", {
      headers: { Authorization: "Bearer test-token" },
    });
  });

  it("保存済みのユーザーIDがあれば遷移しない", async () => {
    const getSession = vi.mocked(supabase!.auth.getSession);
    getSession.mockResolvedValueOnce({
      data: {
        session: { access_token: "test-token" },
      },
      error: null,
    } as Awaited<ReturnType<typeof getSession>>);
    window.localStorage.setItem(OTO_MEISHI_USER_ID_KEY, "testuser");

    render(<UserIdRedirect />);

    await waitFor(() => {
      expect(getSession).toHaveBeenCalledOnce();
    });
    expect(replace).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("プロフィール取得エラー時はユーザーID入力ページへ誤って遷移しない", async () => {
    const getSession = vi.mocked(supabase!.auth.getSession);
    getSession.mockResolvedValueOnce({
      data: {
        session: { access_token: "test-token" },
      },
      error: null,
    } as Awaited<ReturnType<typeof getSession>>);
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "server error" }), { status: 500 }),
    );

    render(<UserIdRedirect />);

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledOnce();
    });
    expect(replace).not.toHaveBeenCalled();
  });
});
