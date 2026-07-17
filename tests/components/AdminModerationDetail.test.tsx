import { fireEvent, render, screen } from "@testing-library/react";
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
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          profile: {
            id: "profile-1",
            userId: "sample-user",
            displayName: "サンプル",
            bio: "自己紹介です",
            theme: "normal",
            status: "active",
            audioUrl: "https://example.com/audio.m4a",
            audioTitle: "自己紹介音声",
            audioStatus: "active",
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
      ),
    );

    render(<AdminModerationDetail profileId="profile-1" />);

    expect(await screen.findByRole("heading", { name: "サンプル" })).toBeDefined();
    expect(screen.getByText("自己紹介音声")).toBeDefined();
    expect(screen.getByRole("link", { name: "リンク先を別タブで開く" }).getAttribute("href"))
      .toBe("https://youtube.com/example");
    expect(screen.getByRole("heading", { name: "管理操作履歴" })).toBeDefined();
    expect(screen.getByText("危険なリンクのため")).toBeDefined();

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
