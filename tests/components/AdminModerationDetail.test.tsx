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
            moderationRequests: [
              {
                id: "request-1",
                kind: "accountAppeal",
                status: "pending",
                message: "問題箇所を修正しました。",
                responseMessage: "",
                resolvedAt: null,
                createdAt: "2026-07-17T05:00:00.000Z",
                updatedAt: "2026-07-17T05:00:00.000Z",
              },
            ],
            moderationCases: [
              {
                id: "case-1",
                targetType: "socialLink",
                targetId: "link-1",
                reasonCode: "unsafeLink",
                status: "preReviewPending",
                reviewMode: "preReview",
                userMessage: "安全でないリンクのため",
                reviewDueAt: "2026-09-15T00:00:00.000Z",
                retentionExpiresAt: "2026-09-15T00:00:00.000Z",
                resolvedAt: null,
                createdAt: "2026-07-17T01:00:00.000Z",
                updatedAt: "2026-07-17T04:00:00.000Z",
                snapshots: [
                  {
                    id: "snapshot-1",
                    kind: "reported",
                    content: {
                      service: "youtube",
                      url: "https://unsafe.example",
                      label: "変更前",
                    },
                    contentHash: null,
                    hasStoredAudio: false,
                    expiresAt: "2026-09-15T00:00:00.000Z",
                    createdAt: "2026-07-17T01:00:00.000Z",
                  },
                  {
                    id: "snapshot-2",
                    kind: "corrected",
                    content: {
                      service: "youtube",
                      url: "https://youtube.com/example",
                      label: "YouTube",
                    },
                    contentHash: null,
                    hasStoredAudio: false,
                    expiresAt: "2026-09-15T00:00:00.000Z",
                    createdAt: "2026-07-17T04:00:00.000Z",
                  },
                ],
                events: [
                  {
                    id: "event-1",
                    eventType: "contentChanged",
                    actorType: "user",
                    actorIdentifier: "auth-use",
                    previousStatus: "correctionRequired",
                    newStatus: "preReviewPending",
                    details: { targetType: "socialLink" },
                    createdAt: "2026-07-17T04:00:00.000Z",
                  },
                ],
              },
              {
                id: "case-profile",
                targetType: "profile",
                targetId: "profile-1",
                reasonCode: "harassment",
                status: "confirmed",
                reviewMode: "preReview",
                userMessage: "プロフィール内容の修正が必要です",
                reviewDueAt: "2026-09-15T00:00:00.000Z",
                retentionExpiresAt: "2026-09-15T00:00:00.000Z",
                resolvedAt: "2026-07-17T05:00:00.000Z",
                createdAt: "2026-07-17T01:00:00.000Z",
                updatedAt: "2026-07-17T05:00:00.000Z",
                snapshots: [
                  {
                    id: "snapshot-profile-reported",
                    kind: "reported",
                    content: {
                      displayName: "変更前の名前",
                      bio: "自己紹介です",
                      theme: "normal",
                    },
                    contentHash: null,
                    hasStoredAudio: false,
                    expiresAt: "2026-09-15T00:00:00.000Z",
                    createdAt: "2026-07-17T01:00:00.000Z",
                  },
                  {
                    id: "snapshot-profile-corrected",
                    kind: "corrected",
                    content: {
                      displayName: "修正後の名前",
                      bio: "修正後の自己紹介",
                      theme: "normal",
                    },
                    contentHash: null,
                    hasStoredAudio: false,
                    expiresAt: "2026-09-15T00:00:00.000Z",
                    createdAt: "2026-07-17T04:30:00.000Z",
                  },
                ],
                events: [
                  {
                    id: "event-profile",
                    eventType: "contentChanged",
                    actorType: "user",
                    actorIdentifier: "auth-use",
                    previousStatus: "correctionRequired",
                    newStatus: "preReviewPending",
                    details: {
                      targetType: "profile",
                      changedFields: ["displayName", "bio"],
                    },
                    createdAt: "2026-07-17T04:30:00.000Z",
                  },
                ],
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
    expect(screen.getAllByText("user / auth-use")).toHaveLength(3);
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
    expect(
      screen.getByRole("heading", { name: "修正内容と審査状況" }),
    ).toBeDefined();
    expect(screen.getByText("安全でないリンク")).toBeDefined();
    expect(screen.getByText(/url: https:\/\/unsafe\.example/)).toBeDefined();
    expect(
      screen.getByText(/url: https:\/\/youtube\.com\/example/),
    ).toBeDefined();
    expect(screen.getAllByText("ユーザーが内容を変更")).toHaveLength(2);
    expect(screen.getByText("変更された項目")).toBeDefined();
    expect(screen.getByText("表示名")).toBeDefined();
    expect(screen.getAllByText("自己紹介").length).toBeGreaterThanOrEqual(1);
    const changedAt = screen.getByText(/変更日時:/);
    expect(changedAt.getAttribute("datetime")).toBe(
      "2026-07-17T04:30:00.000Z",
    );
    expect(screen.getByText(/displayName: 変更前の名前/)).toBeDefined();
    expect(screen.getByText(/displayName: 修正後の名前/)).toBeDefined();

    const approveCaseButton = screen.getByRole("button", {
      name: "修正を承認",
    }) as HTMLButtonElement;
    expect(approveCaseButton.disabled).toBe(true);
    fireEvent.change(
      screen.getByLabelText("ユーザーに通知する審査理由（必須）"),
      { target: { value: "安全なリンクへの変更を確認しました。" } },
    );
    fireEvent.click(approveCaseButton);
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/admin/moderation/cases/case-1",
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer admin-token",
          },
          body: JSON.stringify({
            decision: "approve",
            reason: "安全なリンクへの変更を確認しました。",
            reviewedSnapshotId: "snapshot-2",
          }),
        },
      );
    });

    expect(
      screen.getByRole("heading", { name: "問い合わせ・解除申請" }),
    ).toBeDefined();
    expect(screen.getByText("問題箇所を修正しました。")).toBeDefined();

    const appealButton = screen.getByRole("button", {
      name: "解除を承認",
    }) as HTMLButtonElement;
    expect(appealButton.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("ユーザー向け回答（必須）"), {
      target: { value: "修正を確認したため利用停止を解除します。" },
    });
    fireEvent.click(appealButton);
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/admin/moderation/requests/request-1",
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer admin-token",
          },
          body: JSON.stringify({
            status: "resolved",
            responseMessage: "修正を確認したため利用停止を解除します。",
          }),
        },
      );
    });

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
    expect(
      screen.getByLabelText<HTMLSelectElement>("違反分類（必須）").value,
    ).toBe("inappropriateContent");
    expect(
      screen.getByText(
        "誹謗中傷・なりすまし・その他は確認完了まで非公開、それ以外は修正後に公開して事後確認します。",
      ),
    ).toBeDefined();

    fireEvent.change(screen.getByLabelText("違反分類（必須）"), {
      target: { value: "harassment" },
    });
    fireEvent.change(
      screen.getByLabelText("ユーザーに表示する対応理由（必須）"),
      {
      target: { value: "不適切な内容を確認" },
      },
    );
    expect(submitButton.disabled).toBe(false);
    fireEvent.click(submitButton);

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
    });
  });
});
