import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ProfilePage from "@/app/(site)/profile/page";
import { OTO_MEISHI_USER_ID_KEY } from "@/lib/storageKeys";

const { mocks } = vi.hoisted(() => ({
  mocks: {
    getSession: vi.fn(),
    router: {
      replace: vi.fn(),
    },
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => mocks.router,
}));

vi.mock("@/lib/supabaseClient", () => ({
  supabase: {
    auth: {
      getSession: mocks.getSession,
    },
  },
}));

vi.mock("@/components/card/Card", () => ({
  default: () => <div>プロフィールカード</div>,
}));

const profile = {
  id: "profile-1",
  userId: "testuser",
  displayName: "テストユーザー",
  bio: "自己紹介",
  audioUrl: "",
  audioTitle: "",
  theme: "normal",
  sns: [],
};

describe("ProfilePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    mocks.getSession.mockResolvedValue({
      data: { session: { access_token: "session-token" } },
      error: null,
    });
    vi.stubGlobal("fetch", vi.fn());
  });

  it("未ログインの場合は読み込みを終了してログイン画面へ遷移する", async () => {
    mocks.getSession.mockResolvedValueOnce({
      data: { session: null },
      error: null,
    });

    render(<ProfilePage />);

    await waitFor(() => {
      expect(mocks.router.replace).toHaveBeenCalledWith("/login");
      expect(screen.queryByText("読み込み中...")).toBeNull();
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("ログイン済みの場合は所有プロフィールを取得して表示する", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json(profile));

    render(<ProfilePage />);

    expect(await screen.findByText("プロフィールカード")).toBeDefined();
    expect(fetch).toHaveBeenCalledWith("/api/profile?mine=true", {
      headers: { Authorization: "Bearer session-token" },
    });
    expect(window.localStorage.getItem(OTO_MEISHI_USER_ID_KEY)).toBe(
      "testuser",
    );
    expect(screen.queryByText("読み込み中...")).toBeNull();
  });

  it("プロフィール未作成の場合はユーザーID入力画面へ遷移する", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      Response.json({ error: "profile not found" }, { status: 404 }),
    );

    render(<ProfilePage />);

    await waitFor(() => {
      expect(mocks.router.replace).toHaveBeenCalledWith("/useridInput");
      expect(screen.queryByText("読み込み中...")).toBeNull();
    });
  });

  it("プロフィール取得エラー時は読み込みを終了してエラーを表示する", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      Response.json(
        { error: "プロフィールの取得に失敗しました。" },
        { status: 500 },
      ),
    );

    render(<ProfilePage />);

    expect(
      await screen.findByText("プロフィールの取得に失敗しました。"),
    ).toBeDefined();
    expect(screen.queryByText("読み込み中...")).toBeNull();
    expect(mocks.router.replace).not.toHaveBeenCalled();
  });
});
