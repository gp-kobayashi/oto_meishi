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
        moderationCases={[
          ...d.profile.moderationCases,
          {
            ...d.profile.moderationCases[0],
            id: "case-identity",
            targetType: "profile",
            targetId: "profile-1",
            snapshots: [
              {
                ...d.profile.moderationCases[0].snapshots[0],
                content: { displayName: "報告時の表示名" },
              },
            ],
          },
        ]}
        profileLinks={d.profile.links}
        onReload={onReload}
        onActionMessage={onActionMessage}
      />,
    );
    expect(
      screen
        .getByRole("link", { name: "申請時のSNSを確認する" })
        .getAttribute("href"),
    ).toBe("https://x.com/sample");
    expect(screen.getByText("審査・違反取消の対象")).toBeDefined();
    expect(screen.getByText("case-identity")).toBeDefined();
    expect(screen.getByText("プロフィール全体")).toBeDefined();
    expect(screen.getByText("本人確認の証拠SNS")).toBeDefined();
    expect(
      screen.getByText(/申請時URL：https:\/\/x.com\/sample/),
    ).toBeDefined();
    expect(screen.getByText(/報告時の保存内容/)).toBeDefined();
    expect(screen.getByText(/報告時の表示名/)).toBeDefined();
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

  it("対象リンクが消えていても申請時URLを証拠として表示する", () => {
    const d = createAdminModerationDetail();
    const request = d.profile.identityVerificationRequests[0];
    request.moderationCase = {
      ...request.moderationCase,
      targetType: "socialLink",
      targetId: "deleted-link",
    };
    request.socialLink = null;

    render(
      <AdminIdentityVerificationPanel
        requests={[request]}
        moderationCases={d.profile.moderationCases}
        profileLinks={d.profile.links}
        onReload={vi.fn().mockResolvedValue(undefined)}
        onActionMessage={vi.fn()}
      />,
    );

    expect(
      screen.getByText("リンク（現在は削除または存在しません：deleted-link）"),
    ).toBeDefined();
    expect(
      screen.getByText("現在の登録SNSは確認できません（申請時URLを使用）。"),
    ).toBeDefined();
  });

  it("取消対象リンクと証拠SNSが異なる場合も別々に表示する", () => {
    const d = createAdminModerationDetail();
    const request = {
      ...d.profile.identityVerificationRequests[0],
      moderationCase: {
        ...d.profile.identityVerificationRequests[0].moderationCase,
        targetType: "socialLink" as const,
        targetId: "link-a",
      },
      socialLink: {
        id: "link-b",
        service: "x",
        label: "証拠用X",
        url: "https://x.com/evidence",
        sortOrder: 1,
        status: "active" as const,
      },
      socialUrl: "https://x.com/evidence",
    };

    render(
      <AdminIdentityVerificationPanel
        requests={[request]}
        moderationCases={d.profile.moderationCases}
        profileLinks={[
          {
            id: "link-a",
            service: "youtube",
            label: "取消対象YouTube",
            url: "https://youtube.com/target",
            sortOrder: 0,
            status: "hidden",
          },
          request.socialLink,
        ]}
        onReload={vi.fn().mockResolvedValue(undefined)}
        onActionMessage={vi.fn()}
      />,
    );

    expect(screen.getByText("リンク：取消対象YouTube")).toBeDefined();
    expect(
      screen.getByText("youtube：https://youtube.com/target"),
    ).toBeDefined();
    expect(
      screen.getByText("現在の登録内容：証拠用X（https://x.com/evidence）"),
    ).toBeDefined();
  });

  it("音声対象ケースをリンクと混同せず表示する", () => {
    const d = createAdminModerationDetail();
    const request = {
      ...d.profile.identityVerificationRequests[0],
      moderationCase: {
        ...d.profile.identityVerificationRequests[0].moderationCase,
        targetType: "audio" as const,
        targetId: "audio-1",
      },
      socialLink: null,
    };

    render(
      <AdminIdentityVerificationPanel
        requests={[request]}
        moderationCases={d.profile.moderationCases}
        profileLinks={d.profile.links}
        onReload={vi.fn().mockResolvedValue(undefined)}
        onActionMessage={vi.fn()}
      />,
    );

    expect(screen.getByText("音声")).toBeDefined();
  });
});
