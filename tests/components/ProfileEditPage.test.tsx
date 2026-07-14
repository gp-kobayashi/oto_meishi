import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import ProfileEditPage from "@/app/(site)/profile/edit/page";
import { OTO_MEISHI_USER_ID_KEY } from "@/lib/storageKeys";

const { mocks } = vi.hoisted(() => ({
  mocks: {
    getSession: vi.fn(),
  },
}));

vi.mock("@/lib/supabaseClient", () => ({
  supabase: {
    auth: {
      getSession: mocks.getSession,
    },
  },
}));

vi.mock("@/components/auth/UserIdRedirect", () => ({
  default: () => null,
}));

const baseProfile = {
  id: "profile-1",
  userId: "testuser",
  displayName: "テストユーザー",
  bio: "自己紹介",
  audioUrl: "",
  audioTitle: "音声タイトル",
  theme: "normal",
  sns: [
    {
      service: "x",
      url: "https://x.com/test",
      label: "X",
      sortOrder: 0,
    },
  ],
};

function mockFetchWithProfile(profile = baseProfile) {
  const fetchMock = vi.fn().mockResolvedValueOnce(
    Response.json(profile, {
      status: 200,
    }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function renderLoadedPage(profile = baseProfile) {
  const fetchMock = mockFetchWithProfile(profile);
  render(<ProfileEditPage />);
  await screen.findByDisplayValue(profile.displayName);
  return fetchMock;
}

describe("ProfileEditPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
    window.localStorage.setItem(OTO_MEISHI_USER_ID_KEY, "testuser");
    mocks.getSession.mockResolvedValue({
      data: { session: { access_token: "session-token" } },
    });
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => "blob:audio-preview"),
      revokeObjectURL: vi.fn(),
    });
  });

  it("セッションが無い場合は保存APIを呼ばずにエラーを表示する", async () => {
    const fetchMock = await renderLoadedPage();
    mocks.getSession.mockResolvedValueOnce({ data: { session: null } });

    fireEvent.click(screen.getAllByRole("button", { name: "変更を保存" })[0]);

    expect(
      await screen.findAllByText("セッションがありません。ログインしてください。"),
    ).toHaveLength(3);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/api/profile?userId=testuser");
  });

  it("音声ファイル選択後の保存では、音声アップロード後にプロフィールを保存する", async () => {
    const savedProfile = {
      ...baseProfile,
      audioUrl: "https://r2.example/audio/testuser/new.m4a",
    };
    const fetchMock = await renderLoadedPage();
    fetchMock.mockResolvedValueOnce(
      Response.json({
        success: true,
        audioUrl: "https://r2.example/audio/testuser/new.m4a",
        audioKey: "audio/testuser/new.m4a",
      }),
    );
    fetchMock.mockResolvedValueOnce(Response.json(savedProfile));

    const input = document.querySelector<HTMLInputElement>("input[type='file']");
    expect(input).not.toBeNull();
    fireEvent.change(input!, {
      target: {
        files: [new File(["audio bytes"], "voice.mp3", { type: "audio/mpeg" })],
      },
    });
    fireEvent.click(screen.getAllByRole("button", { name: "変更を保存" })[0]);

    expect(await screen.findAllByText("プロフィールを保存しました。")).toHaveLength(3);
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/audio/upload", {
      method: "POST",
      headers: {
        Authorization: "Bearer session-token",
      },
      body: expect.any(FormData),
    });
    expect(fetchMock).toHaveBeenNthCalledWith(3, "/api/profile", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer session-token",
      },
      body: expect.any(String),
    });

    const savedBody = JSON.parse((fetchMock.mock.calls[2][1] as RequestInit).body as string);
    expect(savedBody).toEqual(
      expect.objectContaining({
        userId: "testuser",
        audioUrl: "https://r2.example/audio/testuser/new.m4a",
      }),
    );
  });

  it("SNSリンクが4件ある場合は追加ボタンを無効にする", async () => {
    await renderLoadedPage({
      ...baseProfile,
      sns: Array.from({ length: 4 }, (_, index) => ({
        service: "x",
        url: `https://x.com/${index}`,
        label: `X${index}`,
        sortOrder: index,
      })),
    });

    expect(
      screen.getByRole<HTMLButtonElement>("button", { name: "+ リンクを追加" }).disabled,
    ).toBe(true);
  });

  it("文字数制限を超えた入力にはバリデーションエラーを表示する", async () => {
    await renderLoadedPage();

    fireEvent.change(screen.getByLabelText("表示名"), {
      target: { value: "a".repeat(21) },
    });
    fireEvent.change(screen.getByLabelText("自己紹介"), {
      target: { value: "a".repeat(61) },
    });
    fireEvent.change(screen.getByLabelText("音声タイトル"), {
      target: { value: "a".repeat(26) },
    });

    await waitFor(() => {
      expect(screen.getByText("文字数制限を超えています（20文字まで）")).toBeDefined();
      expect(screen.getByText("文字数制限を超えています（60文字まで）")).toBeDefined();
      expect(screen.getByText("文字数制限を超えています（25文字まで）")).toBeDefined();
    });
  });
});
