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
    const pendingSummary = screen
      .getByText("危険または不正なリンク")
      .closest("summary");
    expect((pendingSummary?.parentElement as HTMLDetailsElement).open).toBe(
      true,
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

  it("対応済み通報は折りたたみ、展開すると詳細を表示する", () => {
    const d = createAdminModerationDetail();
    const report = { ...d.profile.reports[0], status: "resolved" as const };
    render(
      <AdminReportsPanel
        reports={[report]}
        onReload={vi.fn()}
        onActionMessage={vi.fn()}
      />,
    );
    const summary = screen
      .getByText("危険または不正なリンク")
      .closest("summary");
    expect(summary).not.toBeNull();
    const details = summary?.parentElement;
    expect(details?.tagName).toBe("DETAILS");
    expect((details as HTMLDetailsElement).open).toBe(false);
    fireEvent.click(summary as HTMLElement);
    expect((details as HTMLDetailsElement).open).toBe(true);
    expect(screen.getByText("外部サイトへ誘導されます")).toBeDefined();
  });

  it("未関連の通報は対応済みにできないことを案内する", () => {
    const d = createAdminModerationDetail();
    d.profile.reports = [
      {
        ...d.profile.reports[0],
        moderationCase: {
          id: "case-1",
          status: "correctionRequired",
          reasonCode: "unsafeLink",
        },
        moderationAction: null,
      },
    ];
    render(
      <AdminReportsPanel
        reports={d.profile.reports}
        onReload={vi.fn()}
        onActionMessage={vi.fn()}
      />,
    );
    expect(
      (
        screen.getByRole("button", {
          name: "対応済みにする",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(
      screen.getByText("通報対象への対応後に対応済みにできます。"),
    ).toBeDefined();
  });
});
