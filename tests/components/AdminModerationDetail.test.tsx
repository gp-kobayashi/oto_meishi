import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAdminModerationDetailResponse } from "@/tests/fixtures/adminModerationDetail";

const { mocks } = vi.hoisted(() => ({
  mocks: {
    getSession: vi.fn(),
    router: { replace: vi.fn() },
  },
}));

vi.mock("@/lib/supabaseClient", () => ({
  supabase: { auth: { getSession: mocks.getSession } },
}));
vi.mock("next/navigation", () => ({
  useRouter: () => mocks.router,
}));

import AdminModerationDetail from "@/app/(site)/admin/moderation/[profileId]/AdminModerationDetail";

describe("AdminModerationDetail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({
      data: { session: { access_token: "admin-token" } },
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("ログイン済みの非管理者はプロフィールへ移動する", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      Response.json({ error: "管理者権限がありません。" }, { status: 403 }),
    );
    render(<AdminModerationDetail profileId="profile-1" />);
    await waitFor(() => {
      expect(mocks.router.replace).toHaveBeenCalledWith("/profile");
    });
    expect(screen.queryByText("管理者権限がありません。")).toBeNull();
  });

  it("取得後に主要パネル見出しが構成される", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      createAdminModerationDetailResponse(),
    );
    render(<AdminModerationDetail profileId="profile-1" />);
    expect(
      await screen.findByRole("heading", { name: "サンプル" }),
    ).toBeDefined();
    expect(
      screen.getByRole("heading", { name: "修正内容と審査状況" }),
    ).toBeDefined();
    expect(screen.getByRole("heading", { name: "違反履歴" })).toBeDefined();
    expect(screen.getByRole("heading", { name: "管理操作履歴" })).toBeDefined();
    expect(screen.getByRole("heading", { name: "通報" })).toBeDefined();
    expect(screen.getByRole("heading", { name: "本人確認申請" })).toBeDefined();
    expect(
      screen.getByRole("heading", { name: "問い合わせ・解除申請" }),
    ).toBeDefined();
    expect(screen.getByRole("heading", { name: "対応履歴" })).toBeDefined();
  });
});
