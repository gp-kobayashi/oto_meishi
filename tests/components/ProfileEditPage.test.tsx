import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
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
      id: "link-1",
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
    vi.clearAllMocks();
    window.localStorage.clear();
    window.localStorage.setItem(OTO_MEISHI_USER_ID_KEY, "testuser");
    mocks.getSession.mockResolvedValue({
      data: { session: { access_token: "session-token" } },
    });
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:audio-preview"),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });
    vi.stubGlobal("confirm", vi.fn(() => true));
  });

  it("確認後に登録済み音源を削除して未選択表示にする", async () => {
    const fetchMock = await renderLoadedPage({
      ...baseProfile,
      audioKey: "audio/testuser/old.m4a",
    });
    fetchMock.mockResolvedValueOnce(
      Response.json({ success: true, audioUrl: "", audioTitle: "" }),
    );

    fireEvent.click(screen.getByRole("button", { name: "音源を削除" }));

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "音源を削除" })).toBeNull();
    });
    expect(window.confirm).toHaveBeenCalled();
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/audio", {
      method: "DELETE",
      headers: { Authorization: "Bearer session-token" },
    });
    expect(screen.getByText("未選択")).toBeDefined();
    expect(screen.getByLabelText<HTMLInputElement>("音声タイトル").value).toBe("");
  });

  it("セッションが無い場合は保存APIを呼ばずにエラーを表示する", async () => {
    const fetchMock = await renderLoadedPage();
    mocks.getSession.mockResolvedValueOnce({ data: { session: null } });

    fireEvent.click(screen.getByRole("button", { name: "変更を保存" }));

    expect(
      await screen.findByText("セッションがありません。ログインしてください。"),
    ).toBeDefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/api/profile?mine=true", {
      headers: { Authorization: "Bearer session-token" },
    });
  });

  it("音声ファイル選択後の保存では、音声アップロード後にプロフィールを保存する", async () => {
    const savedProfile = {
      ...baseProfile,
      audioKey: "audio/testuser/new.m4a",
    };
    const fetchMock = await renderLoadedPage();
    fetchMock.mockResolvedValueOnce(
      Response.json({
        success: true,
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
    fireEvent.click(screen.getByRole("button", { name: "変更を保存" }));

    expect(await screen.findByText("プロフィールを保存しました。")).toBeDefined();
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
        audioUrl: "",
        audioKey: "audio/testuser/new.m4a",
      }),
    );
  });

  it("音声ファイルの制限と対応形式を表示する", async () => {
    await renderLoadedPage();

    expect(screen.getByText(/3分以内・64MB以下/)).toBeDefined();
    const input = document.querySelector<HTMLInputElement>("input[type='file']");
    expect(input?.accept).toContain(".m4a");
    expect(input?.accept).toContain(".caf");
    expect(input?.accept).toContain(".webm");
    expect(input?.accept).toContain("audio/*");
  });

  it("ダークとカラフルのテーマクラスを編集カードへ反映する", async () => {
    await renderLoadedPage();
    const editorCard = screen.getByText("編集モード").closest("article");
    expect(editorCard).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "ダーク" }));
    expect(editorCard?.className).toMatch(/dark/);

    fireEvent.click(screen.getByRole("button", { name: "カラフル" }));
    expect(editorCard?.className).toMatch(/colorful/);
    expect(editorCard?.className).not.toMatch(/dark/);
  });

  it("未保存の内容をPCとスマートフォン表示でプレビューする", async () => {
    const fetchMock = await renderLoadedPage();
    fireEvent.change(screen.getByLabelText("表示名"), {
      target: { value: "保存前の表示名" },
    });
    fireEvent.change(screen.getByLabelText("自己紹介"), {
      target: { value: "保存前の自己紹介" },
    });

    fireEvent.click(
      screen.getByRole("button", { name: "公開表示をプレビュー" }),
    );
    const dialog = screen.getByRole("dialog", {
      name: "公開プロフィール表示",
    });
    expect(within(dialog).getByText("保存前の表示名")).toBeDefined();
    expect(within(dialog).getByText("保存前の自己紹介")).toBeDefined();
    expect(
      within(dialog)
        .getByRole("button", { name: "PC表示" })
        .getAttribute("aria-pressed"),
    ).toBe("true");

    fireEvent.click(
      within(dialog).getByRole("button", {
        name: "スマートフォン表示",
      }),
    );
    expect(
      within(dialog)
        .getByRole("button", { name: "スマートフォン表示" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      fetchMock.mock.calls.filter(([, init]) => init?.method === "POST"),
    ).toHaveLength(0);

    fireEvent.click(within(dialog).getByRole("button", { name: "閉じる" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("64MiBを超える音声は送信前に拒否する", async () => {
    await renderLoadedPage();
    const oversizedFile = new File(["audio bytes"], "large.wav", {
      type: "audio/wav",
    });
    Object.defineProperty(oversizedFile, "size", {
      value: 64 * 1024 * 1024 + 1,
    });

    const input = document.querySelector<HTMLInputElement>("input[type='file']");
    fireEvent.change(input!, { target: { files: [oversizedFile] } });

    expect((await screen.findByRole("alert")).textContent).toBe(
      "音声ファイルは64MB以下にしてください。",
    );
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it("アップロードAPIの413を日本語で表示しプロフィール保存へ進まない", async () => {
    const fetchMock = await renderLoadedPage();
    fetchMock.mockResolvedValueOnce(
      Response.json({ error: "request too large" }, { status: 413 }),
    );

    const input = document.querySelector<HTMLInputElement>("input[type='file']");
    fireEvent.change(input!, {
      target: {
        files: [new File(["audio bytes"], "voice.mp3", { type: "audio/mpeg" })],
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "変更を保存" }));

    expect(
      await screen.findByText("音声ファイルは64MB以下にしてください。"),
    ).toBeDefined();
    expect(fetchMock).toHaveBeenCalledTimes(2);
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

  it("新規リンクの案内文をラベルの入力値にしない", async () => {
    await renderLoadedPage();

    fireEvent.click(
      screen.getByRole("button", { name: "+ リンクを追加" }),
    );

    const labelInputs = screen.getAllByLabelText<HTMLInputElement>("ラベル");
    const newLabelInput = labelInputs.at(-1);
    expect(newLabelInput?.value).toBe("");
    expect(newLabelInput?.placeholder).toBe("リンクを追加");
  });

  it("URLを入力した新規リンクのラベルを必須にする", async () => {
    const fetchMock = await renderLoadedPage();

    fireEvent.click(
      screen.getByRole("button", { name: "+ リンクを追加" }),
    );
    const urlInputs = screen.getAllByLabelText<HTMLInputElement>("URL");
    fireEvent.change(urlInputs.at(-1)!, {
      target: { value: "https://example.com/profile" },
    });

    expect(screen.getByText("ラベルを入力してください。")).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "変更を保存" }));
    expect(await screen.findByText("入力内容を確認してください。")).toBeDefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("対象ごとの違反理由と確認中の公開状態を表示する", async () => {
    await renderLoadedPage({
      ...baseProfile,
      moderationCases: [
        {
          id: "case-audio",
          targetType: "audio",
          targetId: "profile-1",
          reasonCode: "copyrightConcern",
          reviewMode: "postReview",
          status: "postReviewPending",
          userMessage: "音声を変更してください。",
          reviewDueAt: "2026-09-29T00:00:00.000Z",
        },
        {
          id: "case-link",
          targetType: "socialLink",
          targetId: "link-1",
          reasonCode: "impersonation",
          reviewMode: "preReview",
          status: "preReviewPending",
          userMessage: "本人と確認できるリンクへ変更してください。",
          reviewDueAt: "2026-09-29T00:00:00.000Z",
        },
      ],
    });

    expect(screen.getByText("著作権に関する問題")).toBeDefined();
    expect(screen.getByText("管理者確認待ち（公開中）")).toBeDefined();
    expect(
      screen.getByText(
        "変更内容は公開されています。管理者が事後確認を行います。",
      ),
    ).toBeDefined();
    expect(screen.getByText("なりすまし")).toBeDefined();
    expect(screen.getByText("管理者確認待ち（非公開）")).toBeDefined();
    expect(
      screen.getByText(
        "変更内容は管理者の確認が完了するまで公開されません。",
      ),
    ).toBeDefined();
  });

  it("音声とリンクが非公開でも対象外のプロフィール項目を保存できる", async () => {
    const moderatedProfile = {
      ...baseProfile,
      audioStatus: "hidden" as const,
      sns: [
        {
          ...baseProfile.sns[0],
          status: "hidden" as const,
        },
      ],
      moderationCases: [
        {
          id: "case-audio",
          targetType: "audio" as const,
          targetId: "profile-1",
          reasonCode: "inappropriateContent" as const,
          reviewMode: "postReview" as const,
          status: "correctionRequired" as const,
          userMessage: "音声を変更してください。",
          reviewDueAt: "2026-09-29T00:00:00.000Z",
        },
        {
          id: "case-link",
          targetType: "socialLink" as const,
          targetId: "link-1",
          reasonCode: "unsafeLink" as const,
          reviewMode: "postReview" as const,
          status: "correctionRequired" as const,
          userMessage: "リンクを変更してください。",
          reviewDueAt: "2026-09-29T00:00:00.000Z",
        },
      ],
    };
    const fetchMock = await renderLoadedPage(moderatedProfile);
    fetchMock.mockResolvedValueOnce(
      Response.json({
        ...moderatedProfile,
        displayName: "変更後の表示名",
      }),
    );

    fireEvent.change(screen.getByLabelText("表示名"), {
      target: { value: "変更後の表示名" },
    });
    fireEvent.click(screen.getByRole("button", { name: "変更を保存" }));

    expect(await screen.findByText("プロフィールを保存しました。")).toBeDefined();
    const requestBody = JSON.parse(
      (fetchMock.mock.calls[1][1] as RequestInit).body as string,
    );
    expect(requestBody).toEqual(
      expect.objectContaining({
        displayName: "変更後の表示名",
        audioStatus: "hidden",
        sns: [
          expect.objectContaining({
            id: "link-1",
            status: "hidden",
            url: "https://x.com/test",
          }),
        ],
      }),
    );
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

  it("HTTPSでないSNS URLには入力エラーを表示する", async () => {
    await renderLoadedPage();

    const urlInput = screen.getByLabelText<HTMLInputElement>("URL");
    expect(urlInput.type).toBe("url");

    fireEvent.change(urlInput, {
      target: { value: "http://x.com/test" },
    });

    expect(
      await screen.findByText("URLはhttps://から入力してください。"),
    ).toBeDefined();
  });

  it("不正なSNS URLがある場合は保存処理へ進まない", async () => {
    const fetchMock = await renderLoadedPage();

    fireEvent.change(screen.getByLabelText("URL"), {
      target: { value: "javascript:alert(1)" },
    });
    fireEvent.click(screen.getByRole("button", { name: "変更を保存" }));

    expect(await screen.findByText("入力内容を確認してください。")).toBeDefined();
    expect(mocks.getSession).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/api/profile?mine=true", {
      headers: { Authorization: "Bearer session-token" },
    });
  });

  it("選択したサービスに応じたURL入力例を表示する", async () => {
    await renderLoadedPage();

    const serviceSelect = screen.getByLabelText<HTMLSelectElement>("サービス");
    const urlInput = screen.getByLabelText<HTMLInputElement>("URL");

    expect(urlInput.placeholder).toBe("https://x.com/yourname");

    fireEvent.change(serviceSelect, { target: { value: "youtube" } });

    expect(screen.getByLabelText<HTMLInputElement>("URL").placeholder).toBe(
      "https://www.youtube.com/@yourname",
    );
  });

  it("サービスを変更しても入力済みURLを上書きしない", async () => {
    await renderLoadedPage();

    const serviceSelect = screen.getByLabelText<HTMLSelectElement>("サービス");
    const urlInput = screen.getByLabelText<HTMLInputElement>("URL");
    const originalUrl = urlInput.value;

    fireEvent.change(serviceSelect, { target: { value: "instagram" } });

    const updatedUrlInput = screen.getByLabelText<HTMLInputElement>("URL");
    expect(updatedUrlInput.value).toBe(originalUrl);
    expect(updatedUrlInput.placeholder).toBe(
      "https://www.instagram.com/yourname",
    );
  });
});
