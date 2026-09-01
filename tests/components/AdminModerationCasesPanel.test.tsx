import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { vi, it, expect, describe, afterEach, beforeEach } from "vitest";
import AdminModerationCasesPanel from "@/app/(site)/admin/moderation/[profileId]/AdminModerationCasesPanel";
import { createAdminModerationDetail } from "@/tests/fixtures/adminModerationDetail";
const { getSession } = vi.hoisted(() => ({ getSession: vi.fn() }));
getSession.mockResolvedValue({
  data: { session: { access_token: "admin-token" } },
});
vi.mock("@/lib/supabaseClient", () => ({ supabase: { auth: { getSession } } }));
vi.mock("@/components/admin/AdminAudioPlayer", () => ({
  default: ({ label }: { label: string }) => (
    <button type="button">{label}</button>
  ),
}));
describe("AdminModerationCasesPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSession.mockResolvedValue({
      data: { session: { access_token: "admin-token" } },
    });
  });
  afterEach(() => vi.restoreAllMocks());
  it("スナップショットと変更項目、音声ボタンを表示する", async () => {
    const d = createAdminModerationDetail();
    render(
      <AdminModerationCasesPanel
        cases={d.profile.moderationCases}
        profileId="profile-1"
        hasAudio={true}
        onReload={vi.fn()}
        onActionMessage={vi.fn()}
      />,
    );
    expect(screen.getByText("変更された項目")).toBeDefined();
    expect(screen.getByText("表示名")).toBeDefined();
    expect(screen.getByText("audioTitle: 変更前の音声")).toBeDefined();
    expect(screen.getByText(/安全でないリンクのため/)).toBeDefined();
    expect(
      screen.getAllByRole("button", { name: /非公開時の音声|修正後の音声/ })
        .length,
    ).toBeGreaterThan(0);
    const completedSummary = screen
      .getByText(/音声 \/ 不適切な内容/)
      .closest("summary");
    expect(completedSummary).not.toBeNull();
    expect((completedSummary?.parentElement as HTMLDetailsElement).open).toBe(
      false,
    );
    const pendingSummary = screen
      .getByText(/リンク \/ 安全でないリンク/)
      .closest("summary");
    expect((pendingSummary?.parentElement as HTMLDetailsElement).open).toBe(
      true,
    );
    expect(screen.getByRole("button", { name: "修正を承認" })).toBeDefined();
  });
  it("修正承認をPATCHし審査結果メッセージを通知する", async () => {
    const onReload = vi.fn().mockResolvedValue(undefined);
    const onActionMessage = vi.fn();
    const f = vi
      .spyOn(global, "fetch")
      .mockResolvedValue(new Response("{}", { status: 200 }));
    const d = createAdminModerationDetail();
    render(
      <AdminModerationCasesPanel
        cases={d.profile.moderationCases}
        profileId="profile-1"
        hasAudio={true}
        onReload={onReload}
        onActionMessage={onActionMessage}
      />,
    );
    fireEvent.change(
      screen.getByLabelText("ユーザーに通知する審査理由（必須）"),
      { target: { value: "確認しました" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "修正を承認" }));
    await waitFor(() => {
      expect(f).toHaveBeenCalledWith("/api/admin/moderation/cases/case-1", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer admin-token",
        },
        body: JSON.stringify({
          decision: "approve",
          reason: "確認しました",
          reviewedSnapshotId: "snapshot-2",
        }),
      });
      expect(onReload).toHaveBeenCalledTimes(1);
      expect(onActionMessage).toHaveBeenCalledWith(
        "審査結果を保存し、ユーザーへ通知しました。",
      );
    });
  });

  it("なりすまし案件では承認操作を表示せず本人確認申請へ誘導する", () => {
    const d = createAdminModerationDetail();
    const impersonationCase = {
      ...d.profile.moderationCases[0],
      id: "case-impersonation",
      reasonCode: "impersonation" as const,
    };

    render(
      <AdminModerationCasesPanel
        cases={[impersonationCase]}
        profileId="profile-1"
        hasAudio={true}
        onReload={vi.fn()}
        onActionMessage={vi.fn()}
      />,
    );

    expect(screen.queryByRole("button", { name: "修正を承認" })).toBeNull();
    expect(
      screen.getByText(
        "なりすまし案件の完了は本人確認申請の審査から行います。",
      ),
    ).toBeDefined();
    expect(
      screen
        .getByRole("link", { name: "本人確認申請を確認する" })
        .getAttribute("href"),
    ).toBe("#identity-verification-heading");
    expect(screen.getByRole("button", { name: "非公開を継続" })).toBeDefined();
    expect(
      screen.getByRole("button", { name: "追加修正を依頼" }),
    ).toBeDefined();
  });
});
