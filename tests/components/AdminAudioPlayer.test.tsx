import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mocks } = vi.hoisted(() => ({
  mocks: { getSession: vi.fn() },
}));

vi.mock("@/lib/supabaseClient", () => ({
  supabase: { auth: { getSession: mocks.getSession } },
}));

import AdminAudioPlayer from "@/components/admin/AdminAudioPlayer";

describe("AdminAudioPlayer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({
      data: { session: { access_token: "admin-token" } },
    });
    vi.stubGlobal("fetch", vi.fn());
  });

  it("管理者トークンで署名URLを取得する", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ audioUrl: "https://signed.example/audio" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const { container } = render(<AdminAudioPlayer profileId="profile 1" />);
    fireEvent.click(screen.getByRole("button", { name: "音声を確認" }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        "/api/admin/audio/playback?profileId=profile%201",
        {
          cache: "no-store",
          headers: { Authorization: "Bearer admin-token" },
        },
      );
    });
    expect(container.querySelector("audio")?.getAttribute("src")).toBe(
      "https://signed.example/audio",
    );
  });
});
