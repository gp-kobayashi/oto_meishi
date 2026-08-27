import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

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

import AdminPage from "@/app/(site)/admin/page";

describe("AdminPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({
      data: { session: { access_token: "admin-token" } },
    });
  });

  it("管理対象の概要を表示する", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          items: [
            {
              id: "profile-1",
              userId: "sample-user",
              displayName: "サンプル",
              status: "hidden",
              hasAudio: false,
              audioTitle: "",
              audioStatus: "active",
              linkCount: 2,
              hiddenLinkCount: 1,
              pendingReportCount: 2,
              pendingReviewCount: 1,
              updatedAt: "2026-07-17T00:00:00.000Z",
            },
          ],
          attentionTotal: 1,
          pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
        }),
        { status: 200 },
      ),
    );

    render(<AdminPage />);

    expect(await screen.findByRole("heading", { name: "サンプル" })).toBeDefined();
    expect(screen.getByText("@sample-user")).toBeDefined();
    expect(screen.getByText("2件（非公開 1件）")).toBeDefined();
    expect(screen.getByText("未確認の通報")).toBeDefined();
    expect(screen.getByText("審査待ち")).toBeDefined();
    expect(screen.getByText("2件", { selector: "p" })).toBeDefined();
    expect(
      screen.getByRole("heading", { name: "管理対象一覧" }).parentElement
        ?.textContent,
    ).not.toContain("1件");
    expect(screen.getByRole("button", { name: "要対応 1件" })).toBeDefined();
  });

  it.each([
    [0, false, ""],
    [1, true, "1"],
    [10, true, "9+"],
  ])("要対応件数 %s の表示を制御する", async (attentionTotal, visible, label) => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      Response.json({
        items: [],
        attentionTotal,
        pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
      }),
    );

    render(<AdminPage />);

    const button = await screen.findByRole("button", {
      name: visible ? `要対応 ${label}件` : "要対応",
    });
    if (visible) {
      expect(button.textContent).toContain(`要対応${label}`);
    } else {
      expect(button.textContent).toContain("要対応");
      expect(button.textContent).not.toContain("0");
    }
  });

  it("未ログインの場合は管理者ログインを求める", async () => {
    mocks.getSession.mockResolvedValue({ data: { session: null } });

    render(<AdminPage />);

    await waitFor(() => {
      expect(
        screen.getByText("管理者アカウントでログインしてください。"),
      ).toBeDefined();
    });
    expect(mocks.router.replace).not.toHaveBeenCalled();
  });

  it("ログイン済みの非管理者はプロフィールへ移動する", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      Response.json(
        { error: "管理者権限がありません。" },
        { status: 403 },
      ),
    );

    render(<AdminPage />);

    await waitFor(() => {
      expect(mocks.router.replace).toHaveBeenCalledWith("/profile");
    });
    expect(
      screen.queryByText("管理者権限がありません。"),
    ).toBeNull();
  });
});
