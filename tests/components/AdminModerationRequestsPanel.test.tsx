import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { vi, it, expect, describe, beforeEach, afterEach } from "vitest";
import AdminModerationRequestsPanel from "@/app/(site)/admin/moderation/[profileId]/AdminModerationRequestsPanel";
import { createAdminModerationDetail } from "@/tests/fixtures/adminModerationDetail";
const { getSession } = vi.hoisted(() => ({ getSession: vi.fn() }));
getSession.mockResolvedValue({
  data: { session: { access_token: "admin-token" } },
});
vi.mock("@/lib/supabaseClient", () => ({ supabase: { auth: { getSession } } }));
describe("AdminModerationRequestsPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSession.mockResolvedValue({
      data: { session: { access_token: "admin-token" } },
    });
  });
  afterEach(() => vi.restoreAllMocks());
  it("申請メッセージを表示し承認PATCHする", async () => {
    const d = createAdminModerationDetail();
    const onReload = vi.fn().mockResolvedValue(undefined);
    const onActionMessage = vi.fn();
    const f = vi
      .spyOn(global, "fetch")
      .mockResolvedValue(new Response("{}", { status: 200 }));
    render(
      <AdminModerationRequestsPanel
        requests={d.profile.moderationRequests}
        onReload={onReload}
        onActionMessage={onActionMessage}
      />,
    );
    expect(screen.getByText("問題箇所を修正しました。")).toBeDefined();
    fireEvent.change(screen.getByLabelText("ユーザー向け回答（必須）"), {
      target: { value: "承認" },
    });
    fireEvent.click(screen.getByRole("button", { name: "解除を承認" }));
    await waitFor(() => {
      expect(f).toHaveBeenCalledWith(
        "/api/admin/moderation/requests/request-1",
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer admin-token",
          },
          body: JSON.stringify({ status: "resolved", responseMessage: "承認" }),
        },
      );
      expect(onReload).toHaveBeenCalledTimes(1);
      expect(onActionMessage).toHaveBeenCalledWith(
        "申請への回答を保存しました。",
      );
    });
  });
});
