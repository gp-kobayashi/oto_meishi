import { beforeEach, describe, expect, it, vi } from "vitest";

const { mocks } = vi.hoisted(() => ({
  mocks: {
    getUser: vi.fn(),
    mkdir: vi.fn(),
    mkdtemp: vi.fn(),
    writeFile: vi.fn(),
    rm: vi.fn(),
    convertToAac: vi.fn(),
    cleanupTempFile: vi.fn(),
    uploadToR2: vi.fn(),
    generateAudioKey: vi.fn(),
    findUniqueProfile: vi.fn(),
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

vi.mock("fs/promises", () => ({
  default: {
    mkdir: mocks.mkdir,
    mkdtemp: mocks.mkdtemp,
    writeFile: mocks.writeFile,
    rm: mocks.rm,
  },
}));

vi.mock("@/lib/audioConverter", () => ({
  convertToAac: mocks.convertToAac,
  cleanupTempFile: mocks.cleanupTempFile,
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

describe("/api/audio/upload route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "auth-user-1" } },
      error: null,
    });
    mocks.findUniqueProfile.mockResolvedValue({ authId: "auth-user-1" });
    mocks.mkdir.mockResolvedValue(undefined);
    mocks.mkdtemp.mockResolvedValue("C:\\project\\.tmp\\upload-123");
    mocks.writeFile.mockResolvedValue(undefined);
    mocks.rm.mockResolvedValue(undefined);
    mocks.convertToAac.mockResolvedValue("C:\\project\\.tmp\\upload-123\\out.m4a");
    mocks.cleanupTempFile.mockResolvedValue(undefined);
    mocks.generateAudioKey.mockReturnValue("audio/testuser/voice-123.m4a");
    mocks.uploadToR2.mockResolvedValue("https://r2.example/audio/testuser/voice-123.m4a");
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
      select: { authId: true },
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

  it("変換とR2アップロードに成功したらURLとキーを返し、一時ファイルを削除する", async () => {
    const response = await POST(uploadRequest(formDataWithFile()));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      audioUrl: "https://r2.example/audio/testuser/voice-123.m4a",
      audioKey: "audio/testuser/voice-123.m4a",
    });
    expect(mocks.writeFile).toHaveBeenCalledWith(
      "C:\\project\\.tmp\\upload-123\\input.bin",
      expect.any(Buffer),
    );
    expect(mocks.convertToAac).toHaveBeenCalledWith({
      inputPath: "C:\\project\\.tmp\\upload-123\\input.bin",
      bitrate: "128k",
    });
    expect(mocks.generateAudioKey).toHaveBeenCalledWith("testuser");
    expect(mocks.uploadToR2).toHaveBeenCalledWith(
      "C:\\project\\.tmp\\upload-123\\out.m4a",
      "audio/testuser/voice-123.m4a",
      "audio/mp4",
    );
    expect(mocks.cleanupTempFile).toHaveBeenCalledWith(
      "C:\\project\\.tmp\\upload-123\\input.bin",
    );
    expect(mocks.cleanupTempFile).toHaveBeenCalledWith(
      "C:\\project\\.tmp\\upload-123\\out.m4a",
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
    await expect(response.json()).resolves.toEqual({ error: "convert failed" });
    expect(mocks.cleanupTempFile).toHaveBeenCalledWith(
      "C:\\project\\.tmp\\upload-123\\input.bin",
    );
    expect(mocks.rm).toHaveBeenCalledWith("C:\\project\\.tmp\\upload-123", {
      recursive: true,
      force: true,
    });
    expect(mocks.uploadToR2).not.toHaveBeenCalled();
  });

  it("R2アップロード失敗時は変換済みファイル、入力ファイル、一時ディレクトリを削除する", async () => {
    mocks.uploadToR2.mockRejectedValueOnce(new Error("upload failed"));

    const response = await POST(uploadRequest(formDataWithFile()));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "upload failed" });
    expect(mocks.cleanupTempFile).toHaveBeenCalledWith(
      "C:\\project\\.tmp\\upload-123\\out.m4a",
    );
    expect(mocks.cleanupTempFile).toHaveBeenCalledWith(
      "C:\\project\\.tmp\\upload-123\\input.bin",
    );
    expect(mocks.rm).toHaveBeenCalledWith("C:\\project\\.tmp\\upload-123", {
      recursive: true,
      force: true,
    });
  });
});
