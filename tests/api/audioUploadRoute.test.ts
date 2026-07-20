import { beforeEach, describe, expect, it, vi } from "vitest";

const { mocks } = vi.hoisted(() => ({
  mocks: {
    getUser: vi.fn(),
    mkdir: vi.fn(),
    mkdtemp: vi.fn(),
    writeFile: vi.fn(),
    rm: vi.fn(),
    stat: vi.fn(),
    convertToAac: vi.fn(),
    uploadToR2: vi.fn(),
    generateAudioKey: vi.fn(),
    findUniqueProfile: vi.fn(),
    inspectAudioFile: vi.fn(),
  },
}));

vi.mock("@/lib/supabaseClient", () => ({
  createServerSupabaseClient: () => ({
    auth: {
      getUser: mocks.getUser,
    },
  }),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    profile: {
      findUnique: mocks.findUniqueProfile,
    },
  },
}));

vi.mock("@/lib/audioInspector", () => ({
  inspectAudioFile: mocks.inspectAudioFile,
}));

vi.mock("fs/promises", () => ({
  default: {
    mkdir: mocks.mkdir,
    mkdtemp: mocks.mkdtemp,
    writeFile: mocks.writeFile,
    rm: mocks.rm,
    stat: mocks.stat,
  },
}));

vi.mock("@/lib/audioConverter", () => ({
  convertToAac: mocks.convertToAac,
  MAX_CONVERTED_AUDIO_FILE_SIZE_BYTES: 5 * 1024 * 1024,
}));

vi.mock("@/lib/r2Storage", () => ({
  uploadToR2: mocks.uploadToR2,
  generateAudioKey: mocks.generateAudioKey,
}));

import { POST } from "@/app/(site)/api/audio/upload/route";

function uploadRequest(formData: FormData, token = "valid-token") {
  return {
    headers: new Headers({
      Authorization: `Bearer ${token}`,
    }),
    formData: async () => formData,
  } as Parameters<typeof POST>[0];
}

function formDataWithFile() {
  const formData = new FormData();
  formData.append("file", new File(["audio bytes"], "声.mp3", { type: "audio/mpeg" }));
  formData.append("userId", "testuser");
  return formData;
}

function fileWithReportedSize(size: number) {
  const file = new File(["audio bytes"], "voice.mp3", { type: "audio/mpeg" });
  Object.defineProperty(file, "size", { value: size });
  return file;
}

function validInputMetadata() {
  return {
    formatName: "mp3",
    durationSeconds: 120,
    streams: [
      {
        index: 0,
        codecType: "audio",
        codecName: "mp3",
        durationSeconds: 120,
        sampleRate: 44100,
        channels: 2,
        attachedPicture: false,
      },
    ],
  };
}

function validOutputMetadata() {
  return {
    formatName: "mov,mp4,m4a,3gp,3g2,mj2",
    durationSeconds: 120,
    streams: [
      {
        index: 0,
        codecType: "audio",
        codecName: "aac",
        durationSeconds: 120,
        sampleRate: 44100,
        channels: 2,
        attachedPicture: false,
      },
    ],
  };
}

describe("/api/audio/upload route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "auth-user-1" } },
      error: null,
    });
    mocks.findUniqueProfile.mockResolvedValue({ authId: "auth-user-1" });
    mocks.inspectAudioFile.mockImplementation(async (filePath: string) =>
      filePath.endsWith("output.m4a")
        ? validOutputMetadata()
        : validInputMetadata()
    );
    mocks.mkdir.mockResolvedValue(undefined);
    mocks.mkdtemp.mockResolvedValue("C:\\project\\.tmp\\upload-123");
    mocks.writeFile.mockResolvedValue(undefined);
    mocks.rm.mockResolvedValue(undefined);
    mocks.stat.mockResolvedValue({ size: 2 * 1024 * 1024 });
    mocks.convertToAac.mockResolvedValue("C:\\project\\.tmp\\upload-123\\output.m4a");
    mocks.generateAudioKey.mockReturnValue("audio/testuser/voice-123.m4a");
    mocks.uploadToR2.mockResolvedValue(undefined);
  });

  it("トークン無しの場合は401を返す", async () => {
    const response = await POST(
      {
        headers: new Headers(),
        formData: async () => new FormData(),
      } as Parameters<typeof POST>[0],
    );

    expect(response.status).toBe(401);
    expect(mocks.getUser).not.toHaveBeenCalled();
  });

  it("リクエスト全体が65MiBを超える場合はformData解析前に413を返す", async () => {
    const formData = vi.fn();
    const response = await POST({
      headers: new Headers({
        Authorization: "Bearer valid-token",
        "Content-Length": String(65 * 1024 * 1024 + 1),
      }),
      formData,
    } as unknown as Parameters<typeof POST>[0]);

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({
      error: "音声ファイルは64MB以下にしてください。",
    });
    expect(formData).not.toHaveBeenCalled();
    expect(mocks.getUser).not.toHaveBeenCalled();
  });

  it("Content-Lengthがない場合は既存のファイル検証へ進む", async () => {
    const response = await POST(uploadRequest(formDataWithFile()));

    expect(response.status).toBe(200);
    expect(mocks.getUser).toHaveBeenCalled();
    expect(mocks.writeFile).toHaveBeenCalled();
  });

  it("fileが無い場合は400を返す", async () => {
    const formData = new FormData();
    formData.append("userId", "testuser");

    const response = await POST(uploadRequest(formData));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "File is required" });
    expect(mocks.writeFile).not.toHaveBeenCalled();
  });

  it("userIdが無い場合は400を返す", async () => {
    const formData = new FormData();
    formData.append("file", new File(["audio bytes"], "voice.mp3"));

    const response = await POST(uploadRequest(formData));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "userId is required" });
    expect(mocks.writeFile).not.toHaveBeenCalled();
  });

  it("fileが文字列の場合は400を返す", async () => {
    const formData = new FormData();
    formData.append("file", "not-a-file");
    formData.append("userId", "testuser");

    const response = await POST(uploadRequest(formData));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "File is required" });
    expect(mocks.findUniqueProfile).not.toHaveBeenCalled();
    expect(mocks.writeFile).not.toHaveBeenCalled();
  });

  it("空ファイルの場合は400を返す", async () => {
    const formData = new FormData();
    formData.append("file", new File([], "empty.wav", { type: "audio/wav" }));
    formData.append("userId", "testuser");

    const response = await POST(uploadRequest(formData));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "空の音声ファイルはアップロードできません。",
    });
    expect(mocks.findUniqueProfile).not.toHaveBeenCalled();
    expect(mocks.writeFile).not.toHaveBeenCalled();
  });

  it("64MiBを超えるファイルの場合は413を返す", async () => {
    const formData = new FormData();
    formData.append("file", fileWithReportedSize(64 * 1024 * 1024 + 1));
    formData.append("userId", "testuser");

    const response = await POST(uploadRequest(formData));

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({
      error: "音声ファイルは64MB以下にしてください。",
    });
    expect(mocks.findUniqueProfile).not.toHaveBeenCalled();
    expect(mocks.writeFile).not.toHaveBeenCalled();
  });

  it("64MiBちょうどのファイルはサイズ検証を通過する", async () => {
    const formData = new FormData();
    formData.append("file", fileWithReportedSize(64 * 1024 * 1024));
    formData.append("userId", "testuser");

    const response = await POST(uploadRequest(formData));

    expect(response.status).toBe(200);
    expect(mocks.writeFile).toHaveBeenCalled();
  });

  it("プロフィールが存在しない場合は404を返す", async () => {
    mocks.findUniqueProfile.mockResolvedValueOnce(null);

    const response = await POST(uploadRequest(formDataWithFile()));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "profile not found" });
    expect(mocks.findUniqueProfile).toHaveBeenCalledWith({
      where: { userId: "testuser" },
      select: { authId: true, status: true, audioStatus: true },
    });
    expect(mocks.writeFile).not.toHaveBeenCalled();
    expect(mocks.convertToAac).not.toHaveBeenCalled();
    expect(mocks.uploadToR2).not.toHaveBeenCalled();
  });

  it("別ユーザーのプロフィールへのアップロードは403を返す", async () => {
    mocks.findUniqueProfile.mockResolvedValueOnce({ authId: "other-auth-user" });

    const response = await POST(uploadRequest(formDataWithFile()));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "このプロフィールに音声をアップロードする権限がありません。",
    });
    expect(mocks.writeFile).not.toHaveBeenCalled();
    expect(mocks.convertToAac).not.toHaveBeenCalled();
    expect(mocks.uploadToR2).not.toHaveBeenCalled();
  });

  it("authId未設定のプロフィールへのアップロードは403を返す", async () => {
    mocks.findUniqueProfile.mockResolvedValueOnce({ authId: null });

    const response = await POST(uploadRequest(formDataWithFile()));

    expect(response.status).toBe(403);
    expect(mocks.writeFile).not.toHaveBeenCalled();
    expect(mocks.convertToAac).not.toHaveBeenCalled();
    expect(mocks.uploadToR2).not.toHaveBeenCalled();
  });

  it("3分を超える音声は422を返し、変換前に一時ファイルを削除する", async () => {
    mocks.inspectAudioFile.mockResolvedValueOnce({
      formatName: "mp3",
      durationSeconds: 180.001,
      streams: [
        {
          index: 0,
          codecType: "audio",
          codecName: "mp3",
          durationSeconds: 180.001,
          sampleRate: 44100,
          channels: 2,
          attachedPicture: false,
        },
      ],
    });

    const response = await POST(uploadRequest(formDataWithFile()));

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({
      error: "音声は3分以内にしてください。",
      code: "duration_too_long",
    });
    expect(mocks.inspectAudioFile).toHaveBeenCalledWith(
      "C:\\project\\.tmp\\upload-123\\input.bin",
    );
    expect(mocks.rm).toHaveBeenCalledWith("C:\\project\\.tmp\\upload-123", {
      recursive: true,
      force: true,
    });
    expect(mocks.convertToAac).not.toHaveBeenCalled();
    expect(mocks.uploadToR2).not.toHaveBeenCalled();
  });

  it("音声ストリームがないファイルは422を返し、変換しない", async () => {
    mocks.inspectAudioFile.mockResolvedValueOnce({
      formatName: "mov,mp4,m4a,3gp,3g2,mj2",
      durationSeconds: 10,
      streams: [
        {
          index: 0,
          codecType: "video",
          codecName: "h264",
          durationSeconds: 10,
          sampleRate: null,
          channels: null,
          attachedPicture: false,
        },
      ],
    });

    const response = await POST(uploadRequest(formDataWithFile()));

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({
      error: "音声ストリームが見つかりません。",
      code: "no_audio_stream",
    });
    expect(mocks.convertToAac).not.toHaveBeenCalled();
    expect(mocks.uploadToR2).not.toHaveBeenCalled();
  });

  it("メタデータ解析失敗時は500を返し、一時ファイルを削除する", async () => {
    mocks.inspectAudioFile.mockRejectedValueOnce(new Error("inspect failed"));

    const response = await POST(uploadRequest(formDataWithFile()));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "音声アップロードの処理中にエラーが発生しました。",
    });
    expect(mocks.rm).toHaveBeenCalledWith("C:\\project\\.tmp\\upload-123", {
      recursive: true,
      force: true,
    });
    expect(mocks.convertToAac).not.toHaveBeenCalled();
    expect(mocks.uploadToR2).not.toHaveBeenCalled();
  });

  it("一時ファイルの書き込み失敗時も一時ディレクトリを削除する", async () => {
    mocks.writeFile.mockRejectedValueOnce(new Error("write failed"));

    const response = await POST(uploadRequest(formDataWithFile()));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "音声アップロードの処理中にエラーが発生しました。",
    });
    expect(mocks.rm).toHaveBeenCalledWith("C:\\project\\.tmp\\upload-123", {
      recursive: true,
      force: true,
    });
    expect(mocks.inspectAudioFile).not.toHaveBeenCalled();
    expect(mocks.convertToAac).not.toHaveBeenCalled();
    expect(mocks.uploadToR2).not.toHaveBeenCalled();
  });

  it("変換とR2アップロードに成功したらキーを返し、一時ファイルを削除する", async () => {
    const response = await POST(uploadRequest(formDataWithFile()));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      audioKey: "audio/testuser/voice-123.m4a",
    });
    expect(mocks.writeFile).toHaveBeenCalledWith(
      "C:\\project\\.tmp\\upload-123\\input.bin",
      expect.any(Buffer),
    );
    expect(mocks.inspectAudioFile).toHaveBeenCalledWith(
      "C:\\project\\.tmp\\upload-123\\input.bin",
    );
    expect(mocks.stat).toHaveBeenCalledWith(
      "C:\\project\\.tmp\\upload-123\\output.m4a",
    );
    expect(mocks.inspectAudioFile).toHaveBeenCalledWith(
      "C:\\project\\.tmp\\upload-123\\output.m4a",
    );
    expect(mocks.convertToAac).toHaveBeenCalledWith({
      inputPath: "C:\\project\\.tmp\\upload-123\\input.bin",
      outputPath: "C:\\project\\.tmp\\upload-123\\output.m4a",
      bitrate: "128k",
      audioStreamIndex: 0,
      outputSampleRate: 44100,
      outputChannels: 2,
    });
    expect(mocks.generateAudioKey).toHaveBeenCalledWith("testuser");
    expect(mocks.uploadToR2).toHaveBeenCalledWith(
      "C:\\project\\.tmp\\upload-123\\output.m4a",
      "audio/testuser/voice-123.m4a",
      "audio/mp4",
    );
    expect(mocks.rm).toHaveBeenCalledWith("C:\\project\\.tmp\\upload-123", {
      recursive: true,
      force: true,
    });
  });

  it("変換失敗時は入力ファイルと一時ディレクトリを削除する", async () => {
    mocks.convertToAac.mockRejectedValueOnce(new Error("convert failed"));

    const response = await POST(uploadRequest(formDataWithFile()));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "音声アップロードの処理中にエラーが発生しました。",
    });
    expect(mocks.rm).toHaveBeenCalledWith("C:\\project\\.tmp\\upload-123", {
      recursive: true,
      force: true,
    });
    expect(mocks.uploadToR2).not.toHaveBeenCalled();
  });

  it("R2アップロード失敗時は一時ディレクトリ全体を削除する", async () => {
    mocks.uploadToR2.mockRejectedValueOnce(new Error("upload failed"));

    const response = await POST(uploadRequest(formDataWithFile()));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "音声アップロードの処理中にエラーが発生しました。",
    });
    expect(mocks.rm).toHaveBeenCalledWith("C:\\project\\.tmp\\upload-123", {
      recursive: true,
      force: true,
    });
  });

  it("変換後ファイルが5MiBを超える場合はR2へ保存しない", async () => {
    mocks.stat.mockResolvedValueOnce({ size: 5 * 1024 * 1024 + 1 });

    const response = await POST(uploadRequest(formDataWithFile()));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "音声アップロードの処理中にエラーが発生しました。",
    });
    expect(mocks.uploadToR2).not.toHaveBeenCalled();
    expect(mocks.rm).toHaveBeenCalled();
  });

  it("変換後ファイルがAACでない場合はR2へ保存しない", async () => {
    mocks.inspectAudioFile.mockResolvedValueOnce(validInputMetadata());
    mocks.inspectAudioFile.mockResolvedValueOnce({
      ...validOutputMetadata(),
      streams: [
        {
          ...validOutputMetadata().streams[0],
          codecName: "mp3",
        },
      ],
    });

    const response = await POST(uploadRequest(formDataWithFile()));

    expect(response.status).toBe(500);
    expect(mocks.uploadToR2).not.toHaveBeenCalled();
    expect(mocks.rm).toHaveBeenCalled();
  });

  it("一時ディレクトリの削除失敗で成功レスポンスを失わない", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.rm.mockRejectedValueOnce(new Error("cleanup failed"));

    const response = await POST(uploadRequest(formDataWithFile()));

    expect(response.status).toBe(200);
    expect(consoleError).toHaveBeenCalledWith(
      "Failed to cleanup audio upload directory:",
      expect.any(Error),
    );
    consoleError.mockRestore();
  });
});
