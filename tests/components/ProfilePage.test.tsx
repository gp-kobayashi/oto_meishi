import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ProfilePage from "@/app/(site)/profile/page";

vi.mock("@/components/auth/UserIdRedirect", () => ({
  default: () => null,
}));

vi.mock("@/components/card/Card", () => ({
  default: () => <div>プロフィールカード</div>,
}));

describe("ProfilePage", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.stubGlobal("fetch", vi.fn());
  });

  it("ユーザーIDの復元待ちには未設定メッセージを表示しない", () => {
    render(<ProfilePage />);

    expect(screen.getByText("読み込み中...")).toBeDefined();
    expect(
      screen.queryByText("ユーザーIDが設定されていません。"),
    ).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
});
