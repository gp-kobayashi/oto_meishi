import { beforeEach, describe, expect, it, vi } from "vitest";
import path from "node:path";
import { createHash } from "node:crypto";

const TEMP_DIR = path.join(process.cwd(), ".tmp", "upload-123");
const INPUT_PATH = path.join(TEMP_DIR, "input.bin");
const OUTPUT_PATH = path.join(TEMP_DIR, "output.m4a");
const CONVERTED_AUDIO_HASH = createHash("sha256")
  .update("converted audio")
  .digest("hex");

const { mocks } = vi.hoisted(() => ({
  mocks: {
    getUser: vi.fn(),
    mkdir: vi.fn(),
    mkdtemp: vi.fn(),
    writeFile: vi.fn(),
    readFile: vi.fn(),
    rm: vi.fn(),
    stat: vi.fn(),
    convertToAac: vi.fn(),
    uploadToR2: vi.fn(),
    generateAudioKey: vi.fn(),
    findUniqueProfile: vi.fn(),
    findFirstProfile: vi.fn(),
    findFirstSnapshot: vi.fn(),
    inspectAudioFile: vi.fn(),
    consumeAudioUploadUserRateLimit: vi.fn(),
    consumeAudioUploadIpRateLimit: vi.fn(),
    updateProfile: vi.fn(),
    transaction: vi.fn(),
    moderationCaseUpdate: vi.fn(),
    moderationCaseCreate: vi.fn(),
    moderationSnapshotCreate: vi.fn(),
    moderationCaseEventCreate: vi.fn(),
    deleteFromR2: vi.fn(),
    extractKeyFromUrl: vi.fn(),
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
    $transaction: mocks.transaction,
    profile: {
      findUnique: mocks.findUniqueProfile,
      findFirst: mocks.findFirstProfile,
      update: mocks.updateProfile,
    },
    moderationSnapshot: { findFirst: mocks.findFirstSnapshot },
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
    readFile: mocks.readFile,
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
  deleteFromR2: mocks.deleteFromR2,
  extractKeyFromUrl: mocks.extractKeyFromUrl,
}));

vi.mock("@/lib/audioUploadRateLimit", () => ({
  consumeAudioUploadUserRateLimit: mocks.consumeAudioUploadUserRateLimit,
  consumeAudioUploadIpRateLimit: mocks.consumeAudioUploadIpRateLimit,
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
    mocks.findUniqueProfile.mockResolvedValue({
      id: "profile-1",
      authId: "auth-user-1",
      status: "active",
      audioStatus: "active",
      audioKey: "",
      audioUrl: "",
      moderationCases: [],
    });
    mocks.findFirstProfile.mockResolvedValue(null);
    mocks.findFirstSnapshot.mockResolvedValue(null);
    mocks.inspectAudioFile.mockImplementation(async (filePath: string) =>
      filePath.endsWith("output.m4a")
        ? validOutputMetadata()
        : validInputMetadata()
    );
    mocks.mkdir.mockResolvedValue(undefined);
    mocks.mkdtemp.mockResolvedValue(TEMP_DIR);
    mocks.writeFile.mockResolvedValue(undefined);
    mocks.readFile.mockResolvedValue(Buffer.from("converted audio"));
    mocks.rm.mockResolvedValue(undefined);
    mocks.stat.mockResolvedValue({ size: 2 * 1024 * 1024 });
    mocks.convertToAac.mockResolvedValue(OUTPUT_PATH);
    mocks.generateAudioKey.mockReturnValue("audio/testuser/voice-123.m4a");
    mocks.uploadToR2.mockResolvedValue(undefined);
    mocks.updateProfile.mockResolvedValue(undefined);
    mocks.transaction.mockImplementation(async (callback) =>
      callback({
        profile: { update: mocks.updateProfile },
        moderationCase: {
          update: mocks.moderationCaseUpdate,
          create: mocks.moderationCaseCreate,
        },
        moderationSnapshot: { create: mocks.moderationSnapshotCreate },
        moderationCaseEvent: { create: mocks.moderationCaseEventCreate },
      }),
    );
    mocks.moderationCaseUpdate.mockResolvedValue({ id: "case-1" });
    mocks.moderationCaseCreate.mockResolvedValue({ id: "case-1" });
    mocks.moderationSnapshotCreate.mockResolvedValue({ id: "snapshot-1" });
    mocks.moderationCaseEventCreate.mockResolvedValue({ id: "event-1" });
    mocks.deleteFromR2.mockResolvedValue(undefined);
    mocks.extractKeyFromUrl.mockReturnValue("audio/testuser/legacy.m4a");
    mocks.consumeAudioUploadUserRateLimit.mockReturnValue({
      allowed: true,
      limit: 10,
      remaining: 9,
      resetAt: Date.now() + 15 * 60 * 1000,
      retryAfterSeconds: 15 * 60,
    });
    mocks.consumeAudioUploadIpRateLimit.mockReturnValue({
      allowed: true,
      limit: 30,
      remaining: 29,
      resetAt: Date.now() + 15 * 60 * 1000,
      retryAfterSeconds: 15 * 60,
    });
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

  it("ユーザーのアップロード回数が上限に達した場合は解析前に429を返す", async () => {
    const formData = vi.fn();
    mocks.consumeAudioUploadUserRateLimit.mockReturnValue({
      allowed: false,
      limit: 10,
      remaining: 0,
      resetAt: 901_000,
      retryAfterSeconds: 120,
    });

    const response = await POST({
      headers: new Headers({ Authorization: "Bearer valid-token" }),
      formData,
    } as unknown as Parameters<typeof POST>[0]);

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("120");
    expect(response.headers.get("X-RateLimit-Limit")).toBe("10");
    expect(response.headers.get("X-RateLimit-Remaining")).toBe("0");
    expect(response.headers.get("X-RateLimit-Reset")).toBe("901");
    await expect(response.json()).resolves.toEqual({
      error:
        "音声アップロードの回数が上限に達しました。しばらく待ってから再度お試しください。",
    });
    expect(formData).not.toHaveBeenCalled();
    expect(mocks.findUniqueProfile).not.toHaveBeenCalled();
  });

  it("接続元IPのアップロード回数が上限に達した場合は解析前に429を返す", async () => {
    const formData = vi.fn();
    mocks.consumeAudioUploadIpRateLimit.mockReturnValue({
      allowed: false,
      limit: 30,
      remaining: 0,
      resetAt: 901_000,
      retryAfterSeconds: 90,
    });

    const response = await POST({
      headers: new Headers({
        Authorization: "Bearer valid-token",
        "CF-Connecting-IP": "203.0.113.10",
      }),
      formData,
    } as unknown as Parameters<typeof POST>[0]);

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("90");
    expect(response.headers.get("X-RateLimit-Limit")).toBe("30");
    await expect(response.json()).resolves.toEqual({
      error:
        "この接続元からの音声アップロードが集中しています。しばらく待ってから再度お試しください。",
    });
    expect(mocks.consumeAudioUploadIpRateLimit).toHaveBeenCalledWith(
      "203.0.113.10",
    );
    expect(formData).not.toHaveBeenCalled();
    expect(mocks.findUniqueProfile).not.toHaveBeenCalled();
  });

  it("接続元IPを取得できない場合はIP制限をスキップする", async () => {
    const response = await POST(uploadRequest(formDataWithFile()));

    expect(response.status).toBe(200);
    expect(mocks.consumeAudioUploadIpRateLimit).not.toHaveBeenCalled();
  });

  it("音声変換中の追加アップロードには429を返す", async () => {
    let finishConversion: ((value: string) => void) | undefined;
    mocks.convertToAac.mockImplementationOnce(
      () =>
        new Promise<string>((resolve) => {
          finishConversion = resolve;
        }),
    );

    const firstUpload = POST(uploadRequest(formDataWithFile()));
    await vi.waitFor(() => {
      expect(mocks.convertToAac).toHaveBeenCalledTimes(1);
    });

    const secondResponse = await POST(uploadRequest(formDataWithFile()));

    expect(secondResponse.status).toBe(429);
    expect(secondResponse.headers.get("Retry-After")).toBe("30");
    await expect(secondResponse.json()).resolves.toEqual({
      error: "ほかの音声を変換中です。しばらく待ってから再度お試しください。",
    });
    expect(mocks.convertToAac).toHaveBeenCalledTimes(1);

    finishConversion?.(OUTPUT_PATH);
    await expect(firstUpload).resolves.toMatchObject({ status: 200 });
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
      select: {
        id: true,
        authId: true,
        status: true,
        accountModerationStatus: true,
        audioStatus: true,
        audioKey: true,
        audioContentHash: true,
        audioUrl: true,
        moderationCases: {
          where: {
            targetType: "audio",
            OR: [
              {
                status: {
                  in: [
                    "correctionRequired",
                    "postReviewPending",
                    "preReviewPending",
                  ],
                },
              },
              { retentionExpiresAt: { gt: expect.any(Date) } },
            ],
          },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
              select: {
                id: true,
                status: true,
                snapshots: {
              where: { kind: "reported" },
              orderBy: [{ createdAt: "desc" }, { id: "desc" }],
              take: 1,
              select: { contentHash: true },
            },
          },
        },
      },
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
    expect(mocks.inspectAudioFile).toHaveBeenCalledWith(INPUT_PATH);
    expect(mocks.rm).toHaveBeenCalledWith(TEMP_DIR, {
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
    expect(mocks.rm).toHaveBeenCalledWith(TEMP_DIR, {
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
    expect(mocks.rm).toHaveBeenCalledWith(TEMP_DIR, {
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
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual({
      success: true,
      audioKey: "audio/testuser/voice-123.m4a",
    });
    expect(mocks.writeFile).toHaveBeenCalledWith(
      INPUT_PATH,
      expect.anything(),
    );
    expect(
      Buffer.isBuffer(mocks.writeFile.mock.calls[0]?.[1]),
    ).toBe(true);
    expect(mocks.inspectAudioFile).toHaveBeenCalledWith(INPUT_PATH);
    expect(mocks.stat).toHaveBeenCalledWith(OUTPUT_PATH);
    expect(mocks.inspectAudioFile).toHaveBeenCalledWith(OUTPUT_PATH);
    expect(mocks.convertToAac).toHaveBeenCalledWith({
      inputPath: INPUT_PATH,
      outputPath: OUTPUT_PATH,
      bitrate: "128k",
      audioStreamIndex: 0,
      outputSampleRate: 44100,
      outputChannels: 2,
    });
    expect(mocks.generateAudioKey).toHaveBeenCalledWith("testuser");
    expect(mocks.uploadToR2).toHaveBeenCalledWith(
      OUTPUT_PATH,
      "audio/testuser/voice-123.m4a",
      "audio/mp4",
    );
    expect(mocks.updateProfile).toHaveBeenCalledWith({
      where: {
        userId: "testuser",
        authId: "auth-user-1",
        audioStatus: "active",
      },
      data: {
        audioKey: "audio/testuser/voice-123.m4a",
        audioContentHash: CONVERTED_AUDIO_HASH,
        audioUrl: "",
        audioStatus: "active",
      },
    });
    expect(mocks.rm).toHaveBeenCalledWith(TEMP_DIR, {
      recursive: true,
      force: true,
    });
  });

  it("旧事後確認待ちの音声を再編集すると非公開の事前確認へ移行する", async () => {
    mocks.findUniqueProfile.mockResolvedValueOnce({
      id: "profile-1",
      authId: "auth-user-1",
      status: "active",
      accountModerationStatus: "active",
      audioStatus: "active",
      audioKey: "audio/testuser/reviewed.m4a",
      audioContentHash: "current-hash",
      audioUrl: "",
      moderationCases: [
        {
          id: "case-1",
          status: "postReviewPending",
          reviewMode: "postReview",
          snapshots: [{ contentHash: "reported-hash" }],
        },
      ],
    });

    const response = await POST(uploadRequest(formDataWithFile()));

    expect(response.status).toBe(200);
    expect(mocks.updateProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ audioStatus: "hidden" }),
      }),
    );
    expect(mocks.moderationCaseUpdate).toHaveBeenCalledWith({
      where: { id: "case-1" },
      data: expect.objectContaining({
        reviewMode: "preReview",
        status: "preReviewPending",
        resolvedAt: null,
      }),
      select: { id: true },
    });
    expect(mocks.moderationSnapshotCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        moderationCaseId: "case-1",
        kind: "corrected",
        contentHash: CONVERTED_AUDIO_HASH,
      }),
    });
    expect(mocks.moderationCaseEventCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        moderationCaseId: "case-1",
        eventType: "contentChanged",
        previousStatus: "postReviewPending",
        newStatus: "preReviewPending",
      }),
    });
  });

  it("削除済み音声を再登録して非公開の事前確認待ちへ更新する", async () => {
    mocks.findUniqueProfile.mockResolvedValueOnce({
      id: "profile-1",
      authId: "auth-user-1",
      status: "active",
      audioStatus: "removed",
      audioKey: "",
      audioUrl: "",
      moderationCases: [
        {
          id: "case-1",
          status: "postReviewPending",
          reviewMode: "postReview",
          snapshots: [{ contentHash: null }],
        },
      ],
    });

    const response = await POST(uploadRequest(formDataWithFile()));

    expect(response.status).toBe(200);
    expect(mocks.updateProfile).toHaveBeenCalledWith({
      where: {
        userId: "testuser",
        authId: "auth-user-1",
        audioStatus: "removed",
      },
      data: {
        audioKey: "audio/testuser/voice-123.m4a",
        audioContentHash: CONVERTED_AUDIO_HASH,
        audioUrl: "",
        audioStatus: "hidden",
      },
    });
    expect(mocks.moderationCaseUpdate).toHaveBeenCalledWith({
      where: { id: "case-1" },
      data: expect.objectContaining({
        reviewMode: "preReview",
        status: "preReviewPending",
        resolvedAt: null,
      }),
      select: { id: true },
    });
    expect(mocks.moderationSnapshotCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        moderationCaseId: "case-1",
        kind: "corrected",
        contentHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    });
    expect(mocks.moderationCaseEventCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        moderationCaseId: "case-1",
        eventType: "contentChanged",
        actorType: "user",
        actorId: "auth-user-1",
        newStatus: "preReviewPending",
      }),
    });
  });

  it("通常違反の非公開音声を変更しても管理者確認まで非公開を維持する", async () => {
    mocks.findUniqueProfile.mockResolvedValueOnce({
      id: "profile-1",
      authId: "auth-user-1",
      status: "active",
      accountModerationStatus: "active",
      audioStatus: "hidden",
      audioKey: "audio/testuser/hidden.m4a",
      audioUrl: "",
      moderationCases: [
        {
          id: "case-1",
          status: "correctionRequired",
          reviewMode: "postReview",
          snapshots: [{ contentHash: null }],
        },
      ],
    });

    const response = await POST(uploadRequest(formDataWithFile()));

    expect(response.status).toBe(200);
    expect(mocks.updateProfile).toHaveBeenCalledWith({
      where: {
        userId: "testuser",
        authId: "auth-user-1",
        audioStatus: "hidden",
      },
      data: {
        audioKey: "audio/testuser/voice-123.m4a",
        audioContentHash: CONVERTED_AUDIO_HASH,
        audioUrl: "",
        audioStatus: "hidden",
      },
    });
    expect(mocks.moderationCaseUpdate).toHaveBeenCalledWith({
      where: { id: "case-1" },
      data: expect.objectContaining({
        reviewMode: "preReview",
        status: "preReviewPending",
      }),
      select: { id: true },
    });
  });

  it("なりすまし等の非公開音声を変更しても事前確認まで非公開を維持する", async () => {
    mocks.findUniqueProfile.mockResolvedValueOnce({
      id: "profile-1",
      authId: "auth-user-1",
      status: "hidden",
      accountModerationStatus: "active",
      audioStatus: "hidden",
      audioKey: "audio/testuser/hidden.m4a",
      audioUrl: "",
      moderationCases: [
        {
          id: "case-1",
          status: "correctionRequired",
          reviewMode: "preReview",
          snapshots: [{ contentHash: null }],
        },
      ],
    });

    const response = await POST(uploadRequest(formDataWithFile()));

    expect(response.status).toBe(200);
    expect(mocks.updateProfile).toHaveBeenCalledWith({
      where: {
        userId: "testuser",
        authId: "auth-user-1",
        audioStatus: "hidden",
      },
      data: {
        audioKey: "audio/testuser/voice-123.m4a",
        audioContentHash: CONVERTED_AUDIO_HASH,
        audioUrl: "",
        audioStatus: "hidden",
      },
    });
    expect(mocks.moderationCaseUpdate).toHaveBeenCalledWith({
      where: { id: "case-1" },
      data: expect.objectContaining({
        reviewMode: "preReview",
        status: "preReviewPending",
      }),
      select: { id: true },
    });
    expect(mocks.moderationCaseEventCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        previousStatus: "correctionRequired",
        newStatus: "preReviewPending",
      }),
    });
  });

  it("利用停止中のアカウントは音声を変更できない", async () => {
    mocks.findUniqueProfile.mockResolvedValueOnce({
      id: "profile-1",
      authId: "auth-user-1",
      status: "active",
      accountModerationStatus: "suspended",
      audioStatus: "hidden",
      audioKey: "",
      audioUrl: "",
      moderationCases: [],
    });

    const response = await POST(uploadRequest(formDataWithFile()));

    expect(response.status).toBe(403);
    expect(mocks.convertToAac).not.toHaveBeenCalled();
    expect(mocks.uploadToR2).not.toHaveBeenCalled();
  });

  it("削除前と同じ音声は再登録しない", async () => {
    const previousHash = createHash("sha256")
      .update("converted audio")
      .digest("hex");
    mocks.findUniqueProfile.mockResolvedValueOnce({
      id: "profile-1",
      authId: "auth-user-1",
      status: "active",
      audioStatus: "removed",
      audioKey: "",
      audioUrl: "",
      moderationCases: [
        {
          id: "case-1",
          status: "postReviewPending",
          reviewMode: "postReview",
          snapshots: [{ contentHash: previousHash }],
        },
      ],
    });

    const response = await POST(uploadRequest(formDataWithFile()));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "非公開前と同じ音声です。別の音声へ変更してください。",
    });
    expect(mocks.uploadToR2).not.toHaveBeenCalled();
    expect(mocks.updateProfile).not.toHaveBeenCalled();
  });

  it("確認済みでも保持期限内の違反音声は再登録しない", async () => {
    mocks.findUniqueProfile.mockResolvedValueOnce({
      id: "profile-1",
      authId: "auth-user-1",
      status: "active",
      audioStatus: "removed",
      audioKey: "",
      audioContentHash: CONVERTED_AUDIO_HASH,
      audioUrl: "",
      moderationCases: [
        {
          id: "case-confirmed",
          status: "confirmed",
          reviewMode: "postReview",
          snapshots: [{ contentHash: CONVERTED_AUDIO_HASH }],
        },
      ],
    });

    const response = await POST(uploadRequest(formDataWithFile()));

    expect(response.status).toBe(409);
    expect(mocks.uploadToR2).not.toHaveBeenCalled();
    expect(mocks.updateProfile).not.toHaveBeenCalled();
    expect(mocks.moderationSnapshotCreate).not.toHaveBeenCalled();
  });

  it("DBへの紐付け失敗時は新しいR2音声を削除する", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.updateProfile.mockRejectedValueOnce(new Error("update failed"));

    try {
      const response = await POST(uploadRequest(formDataWithFile()));

      expect(response.status).toBe(500);
      expect(mocks.deleteFromR2).toHaveBeenCalledWith(
        "audio/testuser/voice-123.m4a",
      );
    } finally {
      consoleError.mockRestore();
    }
  });

  it("DBへの紐付け後に置き換え前のR2音声を削除する", async () => {
    mocks.findUniqueProfile.mockResolvedValueOnce({
      id: "profile-1",
      authId: "auth-user-1",
      status: "active",
      audioStatus: "active",
      audioKey: "audio/testuser/old.m4a",
      audioUrl: "",
      moderationCases: [],
    });

    const response = await POST(uploadRequest(formDataWithFile()));

    expect(response.status).toBe(200);
    expect(mocks.deleteFromR2).toHaveBeenCalledWith(
      "audio/testuser/old.m4a",
    );
    expect(mocks.updateProfile.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.deleteFromR2.mock.invocationCallOrder[0],
    );
  });

  it("置き換え前の音声が期限内スナップショットから参照中なら削除しない", async () => {
    mocks.findUniqueProfile.mockResolvedValueOnce({
      id: "profile-1",
      authId: "auth-user-1",
      status: "active",
      audioStatus: "active",
      audioKey: "audio/testuser/reported.m4a",
      audioUrl: "",
      moderationCases: [
        {
          id: "case-1",
          status: "postReviewPending",
          reviewMode: "postReview",
          snapshots: [{ contentHash: "reported-hash" }],
        },
      ],
    });
    mocks.findFirstSnapshot.mockResolvedValueOnce({ id: "snapshot-reported" });

    const response = await POST(uploadRequest(formDataWithFile()));

    expect(response.status).toBe(200);
    expect(mocks.findFirstSnapshot).toHaveBeenCalledWith({
      where: {
        storageObjectKey: "audio/testuser/reported.m4a",
        expiresAt: { gt: expect.any(Date) },
      },
      select: { id: true },
    });
    expect(mocks.deleteFromR2).not.toHaveBeenCalled();
  });

  it("証拠参照の確認に失敗した場合は安全側で旧音声を残す", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.findUniqueProfile.mockResolvedValueOnce({
      id: "profile-1",
      authId: "auth-user-1",
      status: "active",
      audioStatus: "active",
      audioKey: "audio/testuser/old.m4a",
      audioUrl: "",
      moderationCases: [],
    });
    mocks.findFirstSnapshot.mockRejectedValueOnce(new Error("database error"));

    try {
      const response = await POST(uploadRequest(formDataWithFile()));

      expect(response.status).toBe(200);
      expect(mocks.deleteFromR2).not.toHaveBeenCalled();
      expect(consoleError).toHaveBeenCalledWith(
        "Failed to safely delete replaced audio file:",
        expect.any(Error),
      );
    } finally {
      consoleError.mockRestore();
    }
  });

  it("置き換え前のR2音声を削除できなくてもアップロードは成功する", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.findUniqueProfile.mockResolvedValueOnce({
      id: "profile-1",
      authId: "auth-user-1",
      status: "active",
      audioStatus: "active",
      audioKey: "audio/testuser/old.m4a",
      audioUrl: "",
      moderationCases: [],
    });
    mocks.deleteFromR2.mockRejectedValueOnce(new Error("delete failed"));

    try {
      const response = await POST(uploadRequest(formDataWithFile()));

      expect(response.status).toBe(200);
      expect(consoleError).toHaveBeenCalledWith(
        "Failed to safely delete replaced audio file:",
        expect.any(Error),
      );
    } finally {
      consoleError.mockRestore();
    }
  });

  it("変換失敗時は入力ファイルと一時ディレクトリを削除する", async () => {
    mocks.convertToAac.mockRejectedValueOnce(new Error("convert failed"));

    const response = await POST(uploadRequest(formDataWithFile()));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "音声アップロードの処理中にエラーが発生しました。",
    });
    expect(mocks.rm).toHaveBeenCalledWith(TEMP_DIR, {
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
    expect(mocks.rm).toHaveBeenCalledWith(TEMP_DIR, {
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
