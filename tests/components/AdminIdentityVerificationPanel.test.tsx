import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { vi, it, expect, describe, beforeEach, afterEach } from "vitest";
import AdminIdentityVerificationPanel from "@/app/(site)/admin/moderation/[profileId]/AdminIdentityVerificationPanel";
import { createAdminModerationDetail } from "@/tests/fixtures/adminModerationDetail";
const { getSession } = vi.hoisted(() => ({ getSession: vi.fn() }));
getSession.mockResolvedValue({
  data: { session: { access_token: "admin-token" } },
});
vi.mock("@/lib/supabaseClient", () => ({ supabase: { auth: { getSession } } }));
describe("AdminIdentityVerificationPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSession.mockResolvedValue({
      data: { session: { access_token: "admin-token" } },
    });
  });
  afterEach(() => vi.restoreAllMocks());
  it("本人確認申請と予定内容を表示しPATCHする", async () => {
    const d = createAdminModerationDetail();
    const onReload = vi.fn().mockResolvedValue(undefined);
    const onActionMessage = vi.fn();
    const f = vi
      .spyOn(global, "fetch")
      .mockResolvedValue(new Response("{}", { status: 200 }));
    render(
      <AdminIdentityVerificationPanel
        requests={d.profile.identityVerificationRequests}
        onReload={onReload}
        onActionMessage={onActionMessage}
      />,
    );
    expect(
      screen
        .getByRole("link", { name: "申請時のSNSを確認する" })
        .getAttribute("href"),
    ).toBe("https://x.com/sample");
    fireEvent.change(
      screen.getByLabelText("審査メモ・ユーザーへの説明（必須）"),
      { target: { value: "確認" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "本人と確認" }));
    await waitFor(() => {
      expect(f).toHaveBeenCalledWith(
        "/api/admin/moderation/identity-verification/verification-1",
        {
          method: "PATCH",
          headers: {
            Authorization: "Bearer admin-token",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ decision: "verified", note: "確認" }),
        },
      );
      expect(onReload).toHaveBeenCalledTimes(1);
      expect(onActionMessage).toHaveBeenCalledWith(
        "本人確認を完了し、なりすまし違反の取り消しを記録しました。",
      );
    });
  });
});
