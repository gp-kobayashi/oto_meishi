import { render, screen } from "@testing-library/react";
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
  });
});
