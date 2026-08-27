import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import AdminModerationAttentionSummary from "@/app/(site)/admin/moderation/[profileId]/AdminModerationAttentionSummary";
import { createAdminModerationDetail } from "@/tests/fixtures/adminModerationDetail";

describe("AdminModerationAttentionSummary", () => {
  it("対応項目の件数と対応対象へのリンクを表示する", () => {
    render(
      <AdminModerationAttentionSummary
        profile={createAdminModerationDetail().profile}
      />,
    );

    expect(screen.getByText("要対応 4項目")).toBeDefined();
    expect(screen.getByRole("link", { name: "通報1件" }).getAttribute("href"))
      .toBe("#reports-heading");
    expect(
      screen
        .getByRole("link", { name: "修正内容と審査状況1件" })
        .getAttribute("href"),
    ).toBe("#cases-heading");
    expect(
      screen
        .getByRole("link", { name: "本人確認申請1件" })
        .getAttribute("href"),
    ).toBe("#identity-verification-heading");
    expect(
      screen
        .getByRole("link", { name: "問い合わせ・解除申請1件" })
        .getAttribute("href"),
    ).toBe("#requests-heading");

    const youtubeLinks = screen.getAllByRole("link", { name: "YouTube" });
    expect(youtubeLinks.length).toBe(1);
    expect(youtubeLinks[0].getAttribute("href")).toBe("#link-link-1");
  });

  it("対応項目がなければ空状態を表示する", () => {
    const profile = createAdminModerationDetail().profile;
    profile.reports = [];
    profile.moderationCases = [];
    profile.identityVerificationRequests = [];
    profile.moderationRequests = [];

    render(<AdminModerationAttentionSummary profile={profile} />);

    expect(screen.getByText("現在、要対応の項目はありません。")).toBeDefined();
    expect(
      screen.getByRole("navigation", { name: "要対応項目" }),
    ).toBeDefined();
    expect(screen.queryByRole("link", { name: /件$/ })).toBeNull();
    expect(screen.queryByRole("heading", { name: "対応対象" })).toBeNull();
    expect(screen.queryByRole("list")).toBeNull();
  });
});
