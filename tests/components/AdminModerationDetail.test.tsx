import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mocks } = vi.hoisted(() => ({
  mocks: { getSession: vi.fn() },
}));

vi.mock("@/lib/supabaseClient", () => ({
  supabase: { auth: { getSession: mocks.getSession } },
}));

import AdminModerationDetail from "@/app/(site)/admin/moderation/[profileId]/AdminModerationDetail";

describe("AdminModerationDetail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({
      data: { session: { access_token: "admin-token" } },
    });
  });

  it("音声とリンクの詳細を表示する", async () => {
    const detailResponse = () =>
      new Response(
        JSON.stringify({
          profile: {
            id: "profile-1",
            userId: "sample-user",
            displayName: "サンプル",
            bio: "自己紹介です",
            theme: "normal",
            status: "active",
            hasAudio: false,
            audioTitle: "",
            audioStatus: "removed",
            deletedAudio: {
              moderationCaseId: "case-1",
              status: "postReviewPending",
              reviewMode: "postReview",
              reviewDueAt: "2026-09-15T00:00:00.000Z",
              previousTitle: "自己紹介音声",
              previousStatus: "hidden",
              deletedAt: "2026-07-17T04:00:00.000Z",
              deletedByType: "user",
              deletedByIdentifier: "auth-use",
            },
            createdAt: "2026-07-16T00:00:00.000Z",
            updatedAt: "2026-07-17T00:00:00.000Z",
            links: [
              {
                id: "link-1",
                service: "youtube",
                label: "YouTube",
                url: "https://youtube.com/example",
                sortOrder: 0,
                status: "hidden",
              },
            ],
            reports: [
              {
                id: "report-1",
                reason: "unsafe_link",
                details: "外部サイトへ誘導されます",
                status: "pending",
                reviewNote: "リンク先を確認しました",
                reviewerIdentifier: "auth-adm",
                reviewerRole: "admin",
                reviewedAt: "2026-07-17T03:00:00.000Z",
                createdAt: "2026-07-17T02:00:00.000Z",
                updatedAt: "2026-07-17T02:00:00.000Z",
              },
            ],
            history: [
              {
                id: "action-1",
                targetType: "socialLink",
                targetId: "link-1",
                action: "hide",
                previousStatus: "active",
                newStatus: "hidden",
                reason: "危険なリンクのため",
                adminIdentifier: "auth-adm",
                adminRole: "admin",
                createdAt: "2026-07-17T01:00:00.000Z",
              },
            ],
          },
        }),
        { status: 200 },
      );
    const fetchMock = vi.spyOn(global, "fetch").mockImplementation(
      async (_input, init) =>
        init?.method === "PATCH"
          ? new Response(JSON.stringify({ success: true }), { status: 200 })
          : detailResponse(),
    );

    render(<AdminModerationDetail profileId="profile-1" />);

    expect(await screen.findByRole("heading", { name: "サンプル" })).toBeDefined();
    expect(screen.getByText("自己紹介音声")).toBeDefined();
    expect(screen.getByText("削除済み音声の対応状況")).toBeDefined();
    expect(screen.getByText("事後確認待ち（公開中）")).toBeDefined();
    expect(screen.getByText("hidden")).toBeDefined();
    expect(screen.getByText("user / auth-use")).toBeDefined();
    expect(
      screen.getByText(
        "削除前の音声は確認期限まで管理者確認用として保持されます。",
      ),
    ).toBeDefined();
    expect(screen.getByRole("link", { name: "リンク先を別タブで開く" }).getAttribute("href"))
      .toBe("https://youtube.com/example");
    expect(screen.getByRole("heading", { name: "管理操作履歴" })).toBeDefined();
    expect(screen.getByText("危険なリンクのため")).toBeDefined();
    expect(screen.getByRole("heading", { name: "通報" })).toBeDefined();
    expect(screen.getByText("危険または不正なリンク")).toBeDefined();
    expect(screen.getByText("外部サイトへ誘導されます")).toBeDefined();
    expect(screen.getByText("未確認")).toBeDefined();
    expect(screen.getByText(/最終変更:.*admin.*auth-adm/)).toBeDefined();
    expect(screen.getByText(/対応メモ: リンク先を確認しました/)).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "確認済みにする" }));
    const reportSubmitButton = screen.getByRole("button", {
      name: "メモを記録して変更",
    }) as HTMLButtonElement;
    expect(reportSubmitButton.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("対応メモ（必須）"), {
      target: { value: "内容を確認しました" },
    });
    fireEvent.click(reportSubmitButton);
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/admin/reports/report-1", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer admin-token",
        },
        body: JSON.stringify({
          status: "reviewed",
          note: "内容を確認しました",
        }),
      });
    });

    fireEvent.click(
      screen.getByRole("button", { name: "プロフィールを非公開" }),
    );
    const submitButton = screen.getByRole("button", {
      name: "理由を記録して実行",
    }) as HTMLButtonElement;
    expect(submitButton.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText("対応理由（必須）"), {
      target: { value: "不適切な内容を確認" },
    });
    expect(submitButton.disabled).toBe(false);
  });
});
