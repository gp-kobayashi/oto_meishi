import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AdminModeratedContentPanel from "@/app/(site)/admin/moderation/[profileId]/AdminModeratedContentPanel";
import { createAdminModerationDetail } from "@/tests/fixtures/adminModerationDetail";
const { getSession } = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock("@/lib/supabaseClient", () => ({ supabase: { auth: { getSession } } }));
const profile = () => createAdminModerationDetail().profile;
describe("AdminModeratedContentPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSession.mockResolvedValue({
      data: { session: { access_token: "admin-token" } },
    });
  });
  afterEach(() => vi.restoreAllMocks());
  it("プロフィール音声とリンクを表示し復旧を阻止する", async () => {
    const onReload = vi.fn().mockResolvedValue(undefined);
    const onActionMessage = vi.fn();
    const fetchMock = vi
      .spyOn(global, "fetch")
      .mockResolvedValue(new Response("{}", { status: 200 }));
    const p = await profile();
    render(
      <AdminModeratedContentPanel
        profile={p}
        onReload={onReload}
        onActionMessage={onActionMessage}
      />,
    );
    expect(screen.getByRole("heading", { name: "プロフィール" })).toBeDefined();
    expect(screen.getByText("自己紹介音声")).toBeDefined();
    expect(screen.getByText("管理者確認待ち（非公開）")).toBeDefined();
    expect(screen.getByText("user / auth-use")).toBeDefined();
    expect(
      screen.getByText(
        "削除前の音声は確認期限まで管理者確認用として保持されます。",
      ),
    ).toBeDefined();
    expect(
      screen.getByRole("link", { name: "リンク先を別タブで開く" }),
    ).toBeDefined();
    expect(
      screen
        .getByRole("link", { name: "リンク先を別タブで開く" })
        .getAttribute("href"),
    ).toBe("https://youtube.com/example");
    expect(
      (
        screen.getByRole("button", {
          name: "リンクを復旧",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("選択した違反理由でプロフィール非公開をPATCHする", async () => {
    const onReload = vi.fn().mockResolvedValue(undefined);
    const onActionMessage = vi.fn();
    const fetchMock = vi
      .spyOn(global, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ success: true }), { status: 200 }),
      );
    const p = await profile();
    render(
      <AdminModeratedContentPanel
        profile={p}
        onReload={onReload}
        onActionMessage={onActionMessage}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "プロフィールを非公開" }),
    );
    fireEvent.change(screen.getByLabelText("違反分類（必須）"), {
      target: { value: "harassment" },
    });
    fireEvent.change(
      screen.getByLabelText("ユーザーに表示する対応理由（必須）"),
      { target: { value: "不適切な内容を確認" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "理由を記録して実行" }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/admin/moderation/actions", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer admin-token",
        },
        body: JSON.stringify({
          targetType: "profile",
          targetId: "profile-1",
          action: "hide",
          reason: "不適切な内容を確認",
          reasonCode: "harassment",
        }),
      });
      expect(onReload).toHaveBeenCalledTimes(1);
      expect(onActionMessage).toHaveBeenCalledWith(
        "プロフィールを非公開にしました。",
      );
    });
  });
});
