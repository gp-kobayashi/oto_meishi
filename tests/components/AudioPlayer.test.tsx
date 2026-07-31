import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AudioPlayer from "@/components/card/audioPlayer/AudioPlayer";

describe("AudioPlayer", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal("fetch", vi.fn());
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
  });

  it("プレビュー音声URLがある場合はAPIを呼ばずに再生する", async () => {
    const fetchMock = vi.spyOn(global, "fetch");
    const playMock = vi
      .spyOn(HTMLMediaElement.prototype, "play")
      .mockResolvedValue();

    render(
      <AudioPlayer
        userId="sample-user"
        audioTitle="保存前の音声"
        previewAudioUrl="blob:http://localhost/preview-audio"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "再生" }));

    await waitFor(() => expect(playMock).toHaveBeenCalled());
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("再生ボタンを押した時にだけ署名URLを取得して再生する", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ audioUrl: "https://signed.example/audio" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const { container } = render(
      <AudioPlayer userId="test user" audioTitle="自己紹介" />,
    );

    expect(fetch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "再生" }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        "/api/audio/playback?userId=test%20user",
        { cache: "no-store" },
      );
      expect(HTMLMediaElement.prototype.play).toHaveBeenCalledOnce();
    });
    expect(container.querySelector("audio")?.getAttribute("src")).toBe(
      "https://signed.example/audio",
    );
  });

  it("署名URLを取得できない場合はエラーを表示する", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ error: "Audio not found." }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      }),
    );

    render(<AudioPlayer userId="testuser" audioTitle="自己紹介" />);
    fireEvent.click(screen.getByRole("button", { name: "再生" }));

    expect((await screen.findByRole("alert")).textContent).toBe("Audio not found.");
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
  });
});
