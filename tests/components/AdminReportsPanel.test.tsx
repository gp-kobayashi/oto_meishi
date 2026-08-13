import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { vi, it, expect, describe, beforeEach, afterEach } from "vitest";
import AdminReportsPanel from "@/app/(site)/admin/moderation/[profileId]/AdminReportsPanel";
import { createAdminModerationDetail } from "@/tests/fixtures/adminModerationDetail";
const { getSession } = vi.hoisted(() => ({ getSession: vi.fn() }));
getSession.mockResolvedValue({
  data: { session: { access_token: "admin-token" } },
});
vi.mock("@/lib/supabaseClient", () => ({ supabase: { auth: { getSession } } }));
describe("AdminReportsPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSession.mockResolvedValue({
      data: { session: { access_token: "admin-token" } },
    });
  });
  afterEach(() => vi.restoreAllMocks());
  it("通報詳細と履歴を表示し状態PATCHする", async () => {
    const d = createAdminModerationDetail();
    const onReload = vi.fn().mockResolvedValue(undefined);
    const onActionMessage = vi.fn();
    const f = vi
      .spyOn(global, "fetch")
      .mockResolvedValue(new Response("{}", { status: 200 }));
    render(
      <AdminReportsPanel
        reports={d.profile.reports}
        onReload={onReload}
        onActionMessage={onActionMessage}
      />,
    );
    expect(screen.getByText("危険または不正なリンク")).toBeDefined();
    expect(screen.getByText("最初の確認記録")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "確認済みにする" }));
    fireEvent.change(screen.getByLabelText("対応メモ（必須）"), {
      target: { value: "確認" },
    });
    fireEvent.click(screen.getByRole("button", { name: "メモを記録して変更" }));
    await waitFor(() => {
      expect(f).toHaveBeenCalledWith("/api/admin/reports/report-1", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer admin-token",
        },
        body: JSON.stringify({ status: "reviewed", note: "確認" }),
      });
      expect(onReload).toHaveBeenCalledTimes(1);
      expect(onActionMessage).toHaveBeenCalledWith(
        "通報を「確認済み」に変更しました。",
      );
    });
  });
});
