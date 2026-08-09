import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mocks } = vi.hoisted(() => ({
  mocks: { getSession: vi.fn() },
}));

vi.mock("@/lib/supabaseClient", () => ({
  supabase: { auth: { getSession: mocks.getSession } },
}));

import IdentityVerificationRequestPanel from "@/components/moderation/IdentityVerificationRequestPanel";

const moderationCaseId = "11111111-1111-4111-8111-111111111111";
const socialLinkId = "22222222-2222-4222-8222-222222222222";

describe("IdentityVerificationRequestPanel", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({
      data: { session: { access_token: "session-token" } },
    });
  });

  it("投稿予定を申請して投稿期限とSNSへの導線を表示する", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json(
        {
          socialUrl: "https://x.com/example",
          plannedContent: "カフェで撮ったコーヒーの写真を投稿します",
          postingDeadlineAt: "2026-08-09T03:30:00.000Z",
        },
        { status: 201 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(
      <IdentityVerificationRequestPanel
        moderationCaseId={moderationCaseId}
        socialLinks={[
          {
            id: socialLinkId,
            service: "x",
            label: "X",
            url: "https://x.com/example",
          },
        ]}
      />,
    );

    fireEvent.change(screen.getByLabelText("投稿予定内容"), {
      target: { value: "カフェで撮ったコーヒーの写真を投稿します" },
    });
    fireEvent.click(screen.getByRole("button", { name: "投稿予定を申請する" }));

    expect(await screen.findByText("投稿予定を受け付けました。")).toBeDefined();
    expect(
      screen.getByRole("link", { name: "投稿先のSNSを開く" }).getAttribute("href"),
    ).toBe("https://x.com/example");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/moderation/identity-verification",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer session-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          moderationCaseId,
          socialLinkId,
          plannedContent: "カフェで撮ったコーヒーの写真を投稿します",
        }),
      },
    );
  });

  it("登録済みSNSがなければ申請を無効にする", () => {
    render(
      <IdentityVerificationRequestPanel
        moderationCaseId={moderationCaseId}
        socialLinks={[]}
      />,
    );

    expect(screen.getByText("登録済みSNSがありません")).toBeDefined();
    expect(
      screen.getByRole<HTMLButtonElement>("button", {
        name: "投稿予定を申請する",
      }).disabled,
    ).toBe(true);
  });

  it("APIのエラーを表示する", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json(
          { error: "この対応について確認中の申請があります。" },
          { status: 409 },
        ),
      ),
    );

    render(
      <IdentityVerificationRequestPanel
        moderationCaseId={moderationCaseId}
        socialLinks={[
          {
            id: socialLinkId,
            service: "x",
            label: "X",
            url: "https://x.com/example",
          },
        ]}
      />,
    );
    fireEvent.change(screen.getByLabelText("投稿予定内容"), {
      target: { value: "確認用の投稿です" },
    });
    fireEvent.click(screen.getByRole("button", { name: "投稿予定を申請する" }));

    await waitFor(() => {
      expect(
        screen.getByText("この対応について確認中の申請があります。"),
      ).toBeDefined();
    });
  });
});
