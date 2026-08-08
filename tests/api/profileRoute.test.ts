import { beforeEach, describe, expect, it, vi } from "vitest";
import { createModeratedUrlHash } from "@/lib/moderationRemediation";

const { mocks } = vi.hoisted(() => ({
  mocks: {
    getUser: vi.fn(),
    deleteUser: vi.fn(),
    isRegistrationBanned: vi.fn(),
    profileFindUnique: vi.fn(),
    profileCreate: vi.fn(),
    profileUpdate: vi.fn(),
    socialLinkDeleteMany: vi.fn(),
    socialLinkCreateMany: vi.fn(),
    socialLinkCreate: vi.fn(),
    socialLinkUpdate: vi.fn(),
    socialLinkDelete: vi.fn(),
    moderationCaseFindFirst: vi.fn(),
    moderationCaseCreate: vi.fn(),
    moderationCaseUpdate: vi.fn(),
    moderationSnapshotFindFirst: vi.fn(),
    moderationSnapshotCreate: vi.fn(),
    moderationCaseEventCreate: vi.fn(),
    transaction: vi.fn(),
    consumeProfileSaveUserRateLimit: vi.fn(),
    consumeProfileSaveIpRateLimit: vi.fn(),
    consumePublicProfileReadIpRateLimit: vi.fn(),
    consumePrivateProfileReadUserRateLimit: vi.fn(),
    consumePrivateProfileReadIpRateLimit: vi.fn(),
  },
}));

vi.mock("@/lib/supabaseClient", () => ({
  createServerSupabaseClient: () => ({
    auth: {
      getUser: mocks.getUser,
      admin: {
        deleteUser: mocks.deleteUser,
      },
    },
  }),
}));

vi.mock("@/lib/registrationBan", () => ({
  isRegistrationBanned: mocks.isRegistrationBanned,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: mocks.transaction,
    profile: {
      findUnique: mocks.profileFindUnique,
      create: mocks.profileCreate,
      update: mocks.profileUpdate,
    },
    socialLink: {
      deleteMany: mocks.socialLinkDeleteMany,
      createMany: mocks.socialLinkCreateMany,
      create: mocks.socialLinkCreate,
      update: mocks.socialLinkUpdate,
      delete: mocks.socialLinkDelete,
    },
  },
}));

vi.mock("@/lib/profileSaveRateLimit", () => ({
  consumeProfileSaveUserRateLimit: mocks.consumeProfileSaveUserRateLimit,
  consumeProfileSaveIpRateLimit: mocks.consumeProfileSaveIpRateLimit,
}));

vi.mock("@/lib/profileReadRateLimit", () => ({
  consumePublicProfileReadIpRateLimit:
    mocks.consumePublicProfileReadIpRateLimit,
  consumePrivateProfileReadUserRateLimit:
    mocks.consumePrivateProfileReadUserRateLimit,
  consumePrivateProfileReadIpRateLimit:
    mocks.consumePrivateProfileReadIpRateLimit,
}));

import { GET, POST } from "@/app/(site)/api/profile/route";

const authHeader = { Authorization: "Bearer valid-token" };

function postRequest(body: unknown) {
  return new Request("http://localhost/api/profile", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeader,
    },
    body: JSON.stringify(body),
  });
}

describe("/api/profile route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({
      data: {
        user: {
          id: "auth-user-1",
          email: "user@example.com",
          identities: [],
        },
      },
      error: null,
    });
    mocks.deleteUser.mockResolvedValue({ data: {}, error: null });
    mocks.isRegistrationBanned.mockResolvedValue(false);
    mocks.socialLinkDeleteMany.mockResolvedValue({ count: 0 });
    mocks.socialLinkCreateMany.mockResolvedValue({ count: 0 });
    mocks.socialLinkCreate.mockResolvedValue({});
    mocks.socialLinkUpdate.mockResolvedValue({});
    mocks.socialLinkDelete.mockResolvedValue({});
    mocks.moderationCaseCreate.mockResolvedValue({ id: "case-1" });
    mocks.moderationCaseUpdate.mockResolvedValue({ id: "case-1" });
    mocks.moderationSnapshotCreate.mockResolvedValue({});
    mocks.moderationCaseEventCreate.mockResolvedValue({});
    mocks.transaction.mockImplementation(async (callback) =>
      callback({
        profile: {
          findUnique: mocks.profileFindUnique,
          create: mocks.profileCreate,
          update: mocks.profileUpdate,
        },
        socialLink: {
          deleteMany: mocks.socialLinkDeleteMany,
          createMany: mocks.socialLinkCreateMany,
          create: mocks.socialLinkCreate,
          update: mocks.socialLinkUpdate,
          delete: mocks.socialLinkDelete,
        },
        moderationCase: {
          findFirst: mocks.moderationCaseFindFirst,
          create: mocks.moderationCaseCreate,
          update: mocks.moderationCaseUpdate,
        },
        moderationSnapshot: {
          findFirst: mocks.moderationSnapshotFindFirst,
          create: mocks.moderationSnapshotCreate,
        },
        moderationCaseEvent: {
          create: mocks.moderationCaseEventCreate,
        },
      }),
    );
    mocks.consumeProfileSaveUserRateLimit.mockReturnValue({
      allowed: true,
      limit: 30,
      remaining: 29,
      resetAt: Date.now() + 15 * 60 * 1000,
      retryAfterSeconds: 15 * 60,
    });
    mocks.consumeProfileSaveIpRateLimit.mockReturnValue({
      allowed: true,
      limit: 100,
      remaining: 99,
      resetAt: Date.now() + 15 * 60 * 1000,
      retryAfterSeconds: 15 * 60,
    });
    mocks.consumePublicProfileReadIpRateLimit.mockReturnValue({
      allowed: true,
      limit: 300,
      remaining: 299,
      resetAt: Date.now() + 15 * 60 * 1000,
      retryAfterSeconds: 15 * 60,
    });
    mocks.consumePrivateProfileReadUserRateLimit.mockReturnValue({
      allowed: true,
      limit: 120,
      remaining: 119,
      resetAt: Date.now() + 15 * 60 * 1000,
      retryAfterSeconds: 15 * 60,
    });
    mocks.consumePrivateProfileReadIpRateLimit.mockReturnValue({
      allowed: true,
      limit: 300,
      remaining: 299,
      resetAt: Date.now() + 15 * 60 * 1000,
      retryAfterSeconds: 15 * 60,
    });
  });

  it("認証ユーザーに紐づく既存プロフィールを返す", async () => {
    const profile = {
      id: "profile-1",
      userId: "testuser",
      authId: "auth-user-1",
      sns: [],
    };
    mocks.profileFindUnique.mockResolvedValueOnce(profile);

    const response = await GET(
      new Request("http://localhost/api/profile?mine=true", {
        headers: authHeader,
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual(profile);
    expect(mocks.getUser).toHaveBeenCalledWith("valid-token");
    expect(mocks.profileFindUnique).toHaveBeenCalledWith({
      where: { authId: "auth-user-1" },
      include: {
        sns: true,
        moderationCases: {
          where: {
            status: {
              in: [
                "correctionRequired",
                "postReviewPending",
                "preReviewPending",
              ],
            },
          },
          select: {
            id: true,
            targetType: true,
            targetId: true,
            reasonCode: true,
            reviewMode: true,
            status: true,
            userMessage: true,
            reviewDueAt: true,
          },
          orderBy: { updatedAt: "desc" },
        },
      },
    });
  });

  it("認証ユーザーにプロフィールがなければ404を返す", async () => {
    mocks.profileFindUnique.mockResolvedValueOnce(null);

    const response = await GET(
      new Request("http://localhost/api/profile?mine=true", {
        headers: authHeader,
      }),
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "profile not found",
    });
  });

  it("自分のプロフィール取得がユーザー上限に達した場合はDB照会前に429を返す", async () => {
    mocks.consumePrivateProfileReadUserRateLimit.mockReturnValueOnce({
      allowed: false,
      limit: 120,
      remaining: 0,
      resetAt: 901_000,
      retryAfterSeconds: 120,
    });

    const response = await GET(
      new Request("http://localhost/api/profile?mine=true", {
        headers: authHeader,
      }),
    );

    expect(response.status).toBe(429);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("Retry-After")).toBe("120");
    expect(response.headers.get("X-RateLimit-Limit")).toBe("120");
    await expect(response.json()).resolves.toEqual({
      error:
        "プロフィール取得の回数が上限に達しました。しばらく待ってから再度お試しください。",
    });
    expect(mocks.consumePrivateProfileReadUserRateLimit).toHaveBeenCalledWith(
      "auth-user-1",
    );
    expect(mocks.profileFindUnique).not.toHaveBeenCalled();
  });

  it("自分のプロフィール取得がIP上限に達した場合はDB照会前に429を返す", async () => {
    mocks.consumePrivateProfileReadIpRateLimit.mockReturnValueOnce({
      allowed: false,
      limit: 300,
      remaining: 0,
      resetAt: 901_000,
      retryAfterSeconds: 90,
    });
    const profileRequest = new Request(
      "http://localhost/api/profile?mine=true",
      {
        headers: {
          ...authHeader,
          "CF-Connecting-IP": "203.0.113.10",
        },
      },
    );

    const response = await GET(profileRequest);

    expect(response.status).toBe(429);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("Retry-After")).toBe("90");
    expect(response.headers.get("X-RateLimit-Limit")).toBe("300");
    await expect(response.json()).resolves.toEqual({
      error:
        "この接続元からのプロフィール取得が集中しています。しばらく待ってから再度お試しください。",
    });
    expect(mocks.consumePrivateProfileReadIpRateLimit).toHaveBeenCalledWith(
      "203.0.113.10",
    );
    expect(mocks.profileFindUnique).not.toHaveBeenCalled();
  });

  it("自分のプロフィール取得でIPを取得できない場合はIP制限をスキップする", async () => {
    mocks.profileFindUnique.mockResolvedValueOnce({
      id: "profile-1",
      userId: "testuser",
      authId: "auth-user-1",
      sns: [],
    });

    const response = await GET(
      new Request("http://localhost/api/profile?mine=true", {
        headers: authHeader,
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.consumePrivateProfileReadIpRateLimit).not.toHaveBeenCalled();
  });

  it("プロフィール取得の内部エラーをレスポンスへ公開しない", async () => {
    const internalError = new Error(
      "database connection failed: postgresql://internal-host",
    );
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.profileFindUnique.mockRejectedValueOnce(internalError);

    try {
      const response = await GET(
        new Request("http://localhost/api/profile?userId=testuser"),
      );

      expect(response.status).toBe(500);
      await expect(response.json()).resolves.toEqual({
        error: "プロフィールの取得に失敗しました。",
      });
      expect(consoleError).toHaveBeenCalledWith(
        "Failed to get profile",
        internalError,
      );
    } finally {
      consoleError.mockRestore();
    }
  });

  it("公開取得では非公開の音声とリンクをレスポンスから除外する", async () => {
    mocks.profileFindUnique.mockResolvedValueOnce({
      id: "profile-1",
      userId: "testuser",
      status: "active",
      accountModerationStatus: "active",
      audioUrl: "https://example.com/audio.m4a",
      audioKey: "audio/testuser/audio.m4a",
      audioTitle: "音声",
      audioStatus: "hidden",
      sns: [
        { id: "link-1", status: "active", service: "x", url: "https://x.com/test", label: "X" },
        { id: "link-2", status: "hidden", service: "website", url: "https://example.com", label: "Web" },
      ],
    });

    const response = await GET(
      new Request("http://localhost/api/profile?userId=testuser"),
    );
    const profile = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBeNull();
    expect(profile.audioUrl).toBe("");
    expect(profile.audioKey).toBeUndefined();
    expect(profile.authId).toBeUndefined();
    expect(profile.hasAudio).toBe(false);
    expect(profile.audioTitle).toBe("");
    expect(profile.sns).toEqual([
      { service: "x", url: "https://x.com/test", label: "X" },
    ]);
  });

  it("非公開プロフィールは公開取得で404を返す", async () => {
    mocks.profileFindUnique.mockResolvedValueOnce({
      id: "profile-1",
      userId: "testuser",
      status: "hidden",
      sns: [],
    });

    const response = await GET(
      new Request("http://localhost/api/profile?userId=testuser"),
    );

    expect(response.status).toBe(404);
  });

  it("利用停止中のプロフィールは公開取得で404を返す", async () => {
    mocks.profileFindUnique.mockResolvedValueOnce({
      id: "profile-1",
      userId: "testuser",
      status: "active",
      accountModerationStatus: "suspended",
      sns: [],
    });

    const response = await GET(
      new Request("http://localhost/api/profile?userId=testuser"),
    );

    expect(response.status).toBe(404);
  });

  it("公開中の音声は保存先を隠して存在だけを返す", async () => {
    mocks.profileFindUnique.mockResolvedValueOnce({
      id: "profile-1",
      userId: "testuser",
      authId: "auth-user-1",
      status: "active",
      accountModerationStatus: "active",
      theme: "normal",
      displayName: "Test",
      bio: "",
      audioUrl: "https://r2.example/audio/testuser/voice.m4a",
      audioKey: "audio/testuser/voice.m4a",
      audioTitle: "自己紹介",
      audioStatus: "active",
      sns: [],
    });

    const response = await GET(
      new Request("http://localhost/api/profile?userId=testuser"),
    );
    const profile = await response.json();

    expect(response.status).toBe(200);
    expect(profile.audioUrl).toBe("");
    expect(profile.audioKey).toBeUndefined();
    expect(profile.authId).toBeUndefined();
    expect(profile.hasAudio).toBe(true);
    expect(profile.audioTitle).toBe("自己紹介");
  });

  it("公開取得がIP上限に達した場合はDB照会前に429を返す", async () => {
    mocks.consumePublicProfileReadIpRateLimit.mockReturnValueOnce({
      allowed: false,
      limit: 300,
      remaining: 0,
      resetAt: 901_000,
      retryAfterSeconds: 90,
    });
    const profileRequest = new Request(
      "http://localhost/api/profile?userId=testuser",
      { headers: { "CF-Connecting-IP": "203.0.113.10" } },
    );

    const response = await GET(profileRequest);

    expect(response.status).toBe(429);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("Retry-After")).toBe("90");
    expect(response.headers.get("X-RateLimit-Limit")).toBe("300");
    await expect(response.json()).resolves.toEqual({
      error:
        "プロフィールの閲覧が集中しています。しばらく待ってから再度お試しください。",
    });
    expect(mocks.consumePublicProfileReadIpRateLimit).toHaveBeenCalledWith(
      "203.0.113.10",
    );
    expect(mocks.profileFindUnique).not.toHaveBeenCalled();
  });

  it("ルート実体で文字数制限エラーを返し、DBを書き換えない", async () => {
    const response = await POST(
      postRequest({
        userId: "testuser",
        displayName: "a".repeat(21),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "表示名は20文字までです。",
    });
    expect(mocks.profileFindUnique).not.toHaveBeenCalled();
    expect(mocks.profileCreate).not.toHaveBeenCalled();
    expect(mocks.profileUpdate).not.toHaveBeenCalled();
  });

  it("プロフィールJSONが64KBを超える場合は413を返す", async () => {
    const response = await POST(
      postRequest({ userId: "testuser", bio: "a".repeat(64 * 1024) }),
    );

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({
      error: "プロフィールデータは64KB以下にしてください。",
    });
    expect(mocks.profileFindUnique).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("ユーザーの保存回数が上限に達した場合は本文解析前に429を返す", async () => {
    mocks.consumeProfileSaveUserRateLimit.mockReturnValueOnce({
      allowed: false,
      limit: 30,
      remaining: 0,
      resetAt: 901_000,
      retryAfterSeconds: 120,
    });
    const profileRequest = postRequest({
      userId: "testuser",
      displayName: "Test User",
    });

    const response = await POST(profileRequest);

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("120");
    expect(response.headers.get("X-RateLimit-Limit")).toBe("30");
    expect(response.headers.get("X-RateLimit-Remaining")).toBe("0");
    await expect(response.json()).resolves.toEqual({
      error:
        "プロフィール保存の回数が上限に達しました。しばらく待ってから再度お試しください。",
    });
    expect(profileRequest.bodyUsed).toBe(false);
    expect(mocks.profileFindUnique).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("接続元IPの保存回数が上限に達した場合は本文解析前に429を返す", async () => {
    mocks.consumeProfileSaveIpRateLimit.mockReturnValueOnce({
      allowed: false,
      limit: 100,
      remaining: 0,
      resetAt: 901_000,
      retryAfterSeconds: 90,
    });
    const profileRequest = new Request("http://localhost/api/profile", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": "203.0.113.10",
        ...authHeader,
      },
      body: JSON.stringify({
        userId: "testuser",
        displayName: "Test User",
      }),
    });

    const response = await POST(profileRequest);

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("90");
    expect(response.headers.get("X-RateLimit-Limit")).toBe("100");
    await expect(response.json()).resolves.toEqual({
      error:
        "この接続元からのプロフィール保存が集中しています。しばらく待ってから再度お試しください。",
    });
    expect(mocks.consumeProfileSaveIpRateLimit).toHaveBeenCalledWith(
      "203.0.113.10",
    );
    expect(profileRequest.bodyUsed).toBe(false);
    expect(mocks.profileFindUnique).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("接続元IPを取得できない場合はIP制限をスキップする", async () => {
    mocks.profileFindUnique.mockResolvedValueOnce({
      id: "profile-1",
      userId: "testuser",
      authId: "auth-user-1",
      status: "active",
      audioStatus: "active",
      sns: [],
    });
    mocks.profileUpdate.mockResolvedValueOnce({});
    mocks.profileFindUnique.mockResolvedValueOnce({
      id: "profile-1",
      userId: "testuser",
      authId: "auth-user-1",
      sns: [],
    });

    const response = await POST(
      postRequest({ userId: "testuser", displayName: "Test User" }),
    );

    expect(response.status).toBe(200);
    expect(mocks.consumeProfileSaveIpRateLimit).not.toHaveBeenCalled();
  });

  it("JSON以外のContent-Typeは本文解析前に415を返す", async () => {
    const profileRequest = new Request("http://localhost/api/profile", {
      method: "POST",
      headers: {
        "Content-Type": "text/plain",
        ...authHeader,
      },
      body: JSON.stringify({ userId: "testuser", displayName: "Test User" }),
    });

    const response = await POST(profileRequest);

    expect(response.status).toBe(415);
    await expect(response.json()).resolves.toEqual({
      error: "Content-Typeはapplication/jsonを指定してください。",
    });
    expect(profileRequest.bodyUsed).toBe(false);
    expect(mocks.consumeProfileSaveUserRateLimit).toHaveBeenCalledWith(
      "auth-user-1",
    );
    expect(mocks.profileFindUnique).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("不正なJSONの場合は400を返す", async () => {
    const response = await POST(
      new Request("http://localhost/api/profile", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeader,
        },
        body: "{invalid",
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "JSONの形式が不正です。",
    });
    expect(mocks.profileFindUnique).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("利用停止中でも非公開のままプロフィールを修正できる", async () => {
    const suspendedProfile = {
      id: "profile-1",
      userId: "testuser",
      authId: "auth-user-1",
      status: "suspended",
      accountModerationStatus: "suspended",
      displayName: "変更前",
      bio: "",
      theme: "normal",
      audioStatus: "active",
      audioTitle: "",
      audioUrl: "",
      sns: [],
    };
    mocks.profileFindUnique.mockResolvedValue(suspendedProfile);
    mocks.profileUpdate.mockResolvedValue(suspendedProfile);

    const response = await POST(
      postRequest({ userId: "testuser", displayName: "変更後" }),
    );

    expect(response.status).toBe(200);
    expect(mocks.profileUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "testuser" },
        data: expect.objectContaining({ displayName: "変更後" }),
      }),
    );
    expect(mocks.profileUpdate).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ accountModerationStatus: "active" }),
      }),
    );
  });

  it("削除手続き中のアカウントはプロフィールを変更できない", async () => {
    mocks.profileFindUnique.mockResolvedValueOnce({
      id: "profile-1",
      userId: "testuser",
      authId: "auth-user-1",
      status: "suspended",
      accountModerationStatus: "deletionPending",
      audioStatus: "active",
      audioTitle: "",
      audioUrl: "",
      sns: [],
    });

    const response = await POST(
      postRequest({ userId: "testuser", displayName: "変更後" }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "削除手続き中のため、プロフィールを変更できません。",
    });
    expect(mocks.profileUpdate).not.toHaveBeenCalled();
    expect(mocks.socialLinkDeleteMany).not.toHaveBeenCalled();
  });

  it("非公開の音声とリンクを維持したままプロフィール項目を変更できる", async () => {
    const hiddenLink = {
      id: "link-hidden",
      profileId: "profile-1",
      service: "youtube",
      url: "https://youtube.com/@example",
      label: "YouTube",
      sortOrder: 0,
      status: "hidden",
    };
    const existingProfile = {
      id: "profile-1",
      userId: "testuser",
      authId: "auth-user-1",
      status: "hidden",
      accountModerationStatus: "active",
      displayName: "変更前",
      bio: "変更前の自己紹介",
      audioStatus: "hidden",
      audioTitle: "非公開音声",
      audioUrl: "",
      theme: "normal",
      sns: [hiddenLink],
    };
    const savedProfile = {
      ...existingProfile,
      displayName: "変更後",
      bio: "変更後の自己紹介",
    };

    mocks.profileFindUnique.mockResolvedValueOnce(existingProfile);
    mocks.profileUpdate.mockResolvedValueOnce(savedProfile);
    mocks.profileFindUnique.mockResolvedValueOnce(savedProfile);

    const response = await POST(
      postRequest({
        userId: "testuser",
        displayName: "変更後",
        bio: "変更後の自己紹介",
        audioTitle: "非公開音声",
        sns: [
          {
            service: "youtube",
            url: "https://youtube.com/@example",
            label: "YouTube",
          },
        ],
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.profileUpdate).toHaveBeenCalled();
    expect(mocks.socialLinkDeleteMany).not.toHaveBeenCalled();
    expect(mocks.socialLinkCreateMany).not.toHaveBeenCalled();
  });

  it("リクエストに含まれない音声とリンクを変更せずに保持する", async () => {
    const hiddenLink = {
      id: "link-hidden",
      profileId: "profile-1",
      service: "youtube",
      url: "https://youtube.com/@example",
      label: "YouTube",
      sortOrder: 0,
      status: "hidden",
    };
    const existingProfile = {
      id: "profile-1",
      userId: "testuser",
      authId: "auth-user-1",
      status: "active",
      accountModerationStatus: "active",
      displayName: "変更前",
      bio: "",
      audioStatus: "hidden",
      audioTitle: "保持するタイトル",
      audioUrl: "",
      theme: "normal",
      sns: [hiddenLink],
    };
    const savedProfile = {
      ...existingProfile,
      displayName: "変更後",
      moderationCases: [],
    };
    mocks.profileFindUnique.mockResolvedValueOnce(existingProfile);
    mocks.profileUpdate.mockResolvedValueOnce(savedProfile);
    mocks.profileFindUnique.mockResolvedValueOnce(savedProfile);

    const response = await POST(
      postRequest({
        userId: "testuser",
        displayName: "変更後",
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.profileUpdate).toHaveBeenCalledWith({
      where: { userId: "testuser" },
      data: {
        displayName: "変更後",
        bio: "",
        audioTitle: "保持するタイトル",
        theme: "normal",
      },
      include: { sns: true },
    });
    expect(mocks.socialLinkUpdate).not.toHaveBeenCalled();
    expect(mocks.socialLinkDelete).not.toHaveBeenCalled();
    expect(mocks.socialLinkCreate).not.toHaveBeenCalled();
  });

  it("非公開音声の状態を維持したまま音声タイトルを変更できる", async () => {
    const existingProfile = {
      id: "profile-1",
      userId: "testuser",
      authId: "auth-user-1",
      status: "active",
      accountModerationStatus: "active",
      audioStatus: "hidden",
      audioTitle: "変更前",
      audioUrl: "",
      sns: [],
    };
    const savedProfile = { ...existingProfile, audioTitle: "変更後" };
    mocks.profileFindUnique.mockResolvedValueOnce(existingProfile);
    mocks.profileUpdate.mockResolvedValueOnce(savedProfile);
    mocks.profileFindUnique.mockResolvedValueOnce(savedProfile);

    const response = await POST(
      postRequest({
        userId: "testuser",
        displayName: "Test User",
        audioTitle: "変更後",
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.profileUpdate).toHaveBeenCalledWith({
      where: { userId: "testuser" },
      data: {
        displayName: "Test User",
        bio: "",
        audioTitle: "変更後",
        theme: "normal",
      },
      include: { sns: true },
    });
  });

  it("非公開前と同じURLへの変更は修正として受け付けない", async () => {
    mocks.profileFindUnique.mockResolvedValueOnce({
      id: "profile-1",
      userId: "testuser",
      authId: "auth-user-1",
      status: "active",
      accountModerationStatus: "active",
      audioStatus: "active",
      audioTitle: "",
      audioUrl: "",
      sns: [
        {
          id: "link-hidden",
          service: "youtube",
          url: "https://youtube.com/@before",
          label: "YouTube",
          sortOrder: 0,
          status: "hidden",
        },
      ],
    });

    const response = await POST(
      postRequest({
        userId: "testuser",
        displayName: "Test User",
        sns: [
          {
            id: "link-hidden",
            service: "youtube",
            url: "https://youtube.com/@before/",
            label: "変更後のラベル",
          },
        ],
      }),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "非公開前と同じリンクです。別のURLへ変更してください。",
    });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("非公開プロフィール本体を修正すると管理者確認待ちのまま非公開を維持する", async () => {
    const existingProfile = {
      id: "profile-1",
      userId: "testuser",
      authId: "auth-user-1",
      status: "hidden",
      accountModerationStatus: "active",
      displayName: "変更前の名前",
      bio: "変更前の自己紹介",
      audioTitle: "",
      theme: "normal",
      sns: [],
    };
    mocks.profileFindUnique.mockResolvedValueOnce(existingProfile);
    mocks.profileFindUnique.mockResolvedValueOnce({
      ...existingProfile,
      status: "hidden",
      displayName: "変更後の名前",
      theme: "dark",
    });
    mocks.moderationCaseFindFirst.mockResolvedValueOnce({
      id: "case-profile",
      status: "correctionRequired",
      reviewMode: "postReview",
    });

    const response = await POST(
      postRequest({
        userId: "testuser",
        displayName: "変更後の名前",
        bio: "変更前の自己紹介",
        theme: "dark",
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.profileUpdate).toHaveBeenCalledWith({
      where: { userId: "testuser" },
      data: {
        displayName: "変更後の名前",
        bio: "変更前の自己紹介",
        audioTitle: "",
        theme: "dark",
        status: "hidden",
      },
      include: { sns: true },
    });
    expect(mocks.moderationCaseUpdate).toHaveBeenCalledWith({
      where: { id: "case-profile" },
      data: expect.objectContaining({
        reviewMode: "preReview",
        status: "preReviewPending",
        resolvedAt: null,
      }),
      select: { id: true },
    });
    expect(mocks.moderationSnapshotCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        moderationCaseId: "case-profile",
        kind: "corrected",
        content: {
          displayName: "変更後の名前",
          bio: "変更前の自己紹介",
          theme: "dark",
        },
      }),
    });
    expect(mocks.moderationCaseEventCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventType: "contentChanged",
        previousStatus: "correctionRequired",
        newStatus: "preReviewPending",
        details: {
          targetType: "profile",
          targetId: "profile-1",
          changedFields: ["displayName", "theme"],
        },
      }),
    });
  });

  it("事前確認対象のプロフィール本体は修正後も非公開を維持する", async () => {
    const existingProfile = {
      id: "profile-1",
      userId: "testuser",
      authId: "auth-user-1",
      status: "hidden",
      accountModerationStatus: "active",
      displayName: "変更前の名前",
      bio: "変更前の自己紹介",
      audioTitle: "",
      theme: "normal",
      sns: [],
    };
    mocks.profileFindUnique.mockResolvedValueOnce(existingProfile);
    mocks.profileFindUnique.mockResolvedValueOnce({
      ...existingProfile,
      bio: "変更後の自己紹介",
    });
    mocks.moderationCaseFindFirst.mockResolvedValueOnce({
      id: "case-profile",
      status: "correctionRequired",
      reviewMode: "preReview",
    });

    const response = await POST(
      postRequest({
        userId: "testuser",
        displayName: "変更前の名前",
        bio: "変更後の自己紹介",
        theme: "normal",
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.profileUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "hidden" }),
      }),
    );
    expect(mocks.moderationCaseUpdate).toHaveBeenCalledWith({
      where: { id: "case-profile" },
      data: expect.objectContaining({ status: "preReviewPending" }),
      select: { id: true },
    });
  });

  it("旧事後確認待ちのプロフィール本体を再編集すると非公開の事前確認へ移行する", async () => {
    const existingProfile = {
      id: "profile-1",
      userId: "testuser",
      authId: "auth-user-1",
      status: "active",
      accountModerationStatus: "active",
      displayName: "最初の修正名",
      bio: "修正前の自己紹介",
      audioTitle: "",
      theme: "normal",
      sns: [],
    };
    mocks.profileFindUnique.mockResolvedValueOnce(existingProfile);
    mocks.profileFindUnique.mockResolvedValueOnce({
      ...existingProfile,
      displayName: "再編集後の名前",
    });
    mocks.moderationCaseFindFirst.mockResolvedValueOnce({
      id: "case-profile",
      status: "postReviewPending",
      reviewMode: "postReview",
    });

    const response = await POST(
      postRequest({
        userId: "testuser",
        displayName: "再編集後の名前",
        bio: "修正前の自己紹介",
        theme: "normal",
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.profileUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "hidden" }),
      }),
    );
    expect(mocks.moderationCaseUpdate).toHaveBeenCalledWith({
      where: { id: "case-profile" },
      data: expect.objectContaining({
        reviewMode: "preReview",
        status: "preReviewPending",
      }),
      select: { id: true },
    });
    expect(mocks.moderationSnapshotCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        moderationCaseId: "case-profile",
        kind: "corrected",
        content: {
          displayName: "再編集後の名前",
          bio: "修正前の自己紹介",
          theme: "normal",
        },
      }),
    });
    expect(mocks.moderationCaseEventCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        previousStatus: "postReviewPending",
        newStatus: "preReviewPending",
        details: expect.objectContaining({ changedFields: ["displayName"] }),
      }),
    });
  });

  it("非公開プロフィール本体が未変更ならケースを遷移させない", async () => {
    const existingProfile = {
      id: "profile-1",
      userId: "testuser",
      authId: "auth-user-1",
      status: "hidden",
      accountModerationStatus: "active",
      displayName: "変更前の名前",
      bio: "変更前の自己紹介",
      audioTitle: "",
      theme: "normal",
      sns: [],
    };
    mocks.profileFindUnique.mockResolvedValueOnce(existingProfile);
    mocks.profileFindUnique.mockResolvedValueOnce(existingProfile);

    const response = await POST(
      postRequest({
        userId: "testuser",
        displayName: "変更前の名前",
        bio: "変更前の自己紹介",
        theme: "normal",
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.moderationCaseFindFirst).not.toHaveBeenCalled();
    expect(mocks.moderationSnapshotCreate).not.toHaveBeenCalled();
    expect(mocks.moderationCaseEventCreate).not.toHaveBeenCalled();
  });

  it("非公開リンクを変更すると管理者確認待ちのまま非公開を維持する", async () => {
    const existingProfile = {
      id: "profile-1",
      userId: "testuser",
      authId: "auth-user-1",
      status: "active",
      accountModerationStatus: "active",
      displayName: "Test User",
      bio: "",
      audioStatus: "active",
      audioTitle: "",
      audioUrl: "",
      theme: "normal",
      sns: [
        {
          id: "link-hidden",
          profileId: "profile-1",
          service: "youtube",
          url: "https://youtube.com/@before",
          label: "YouTube",
          sortOrder: 0,
          status: "hidden",
        },
      ],
    };
    const savedProfile = {
      ...existingProfile,
      sns: [
        {
          ...existingProfile.sns[0],
          url: "https://youtube.com/@after",
          status: "hidden",
        },
      ],
    };
    mocks.profileFindUnique.mockResolvedValueOnce(existingProfile);
    mocks.profileFindUnique.mockResolvedValueOnce(savedProfile);
    mocks.moderationCaseFindFirst.mockResolvedValueOnce({
      id: "case-link",
      status: "correctionRequired",
      reviewMode: "postReview",
    });
    mocks.moderationCaseUpdate.mockResolvedValueOnce({ id: "case-link" });
    mocks.moderationSnapshotFindFirst.mockResolvedValueOnce({
      id: "snapshot-reported",
    });

    const response = await POST(
      postRequest({
        userId: "testuser",
        displayName: "Test User",
        sns: [
          {
            id: "link-hidden",
            service: "youtube",
            url: "https://youtube.com/@after",
            label: "YouTube",
          },
        ],
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.socialLinkUpdate).toHaveBeenCalledWith({
      where: { id: "link-hidden" },
      data: {
        service: "youtube",
        url: "https://youtube.com/@after",
        label: "YouTube",
        sortOrder: 0,
        status: "hidden",
      },
    });
    expect(mocks.moderationCaseUpdate).toHaveBeenCalledWith({
      where: { id: "case-link" },
      data: expect.objectContaining({
        reviewMode: "preReview",
        status: "preReviewPending",
        resolvedAt: null,
      }),
      select: { id: true },
    });
    expect(mocks.moderationSnapshotCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        moderationCaseId: "case-link",
        kind: "corrected",
        content: {
          service: "youtube",
          url: "https://youtube.com/@after",
          label: "YouTube",
        },
      }),
    });
    expect(mocks.moderationCaseEventCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventType: "contentChanged",
        previousStatus: "correctionRequired",
        newStatus: "preReviewPending",
      }),
    });
  });

  it("事前確認対象の非公開リンクは変更後も非公開を維持する", async () => {
    const existingProfile = {
      id: "profile-1",
      userId: "testuser",
      authId: "auth-user-1",
      status: "hidden",
      accountModerationStatus: "active",
      displayName: "Test User",
      bio: "",
      audioStatus: "active",
      audioTitle: "",
      audioUrl: "",
      theme: "normal",
      sns: [
        {
          id: "link-hidden",
          profileId: "profile-1",
          service: "x",
          url: "https://x.com/before",
          label: "X",
          sortOrder: 0,
          status: "hidden",
        },
      ],
    };
    mocks.profileFindUnique.mockResolvedValueOnce(existingProfile);
    mocks.profileFindUnique.mockResolvedValueOnce(existingProfile);
    mocks.moderationCaseFindFirst.mockResolvedValueOnce({
      id: "case-link",
      status: "correctionRequired",
      reviewMode: "preReview",
    });
    mocks.moderationCaseUpdate.mockResolvedValueOnce({ id: "case-link" });
    mocks.moderationSnapshotFindFirst.mockResolvedValueOnce({
      id: "snapshot-reported",
    });

    const response = await POST(
      postRequest({
        userId: "testuser",
        displayName: "Test User",
        sns: [
          {
            id: "link-hidden",
            service: "x",
            url: "https://x.com/after",
            label: "X",
          },
        ],
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.socialLinkUpdate).toHaveBeenCalledWith({
      where: { id: "link-hidden" },
      data: {
        service: "x",
        url: "https://x.com/after",
        label: "X",
        sortOrder: 0,
        status: "hidden",
      },
    });
    expect(mocks.moderationCaseUpdate).toHaveBeenCalledWith({
      where: { id: "case-link" },
      data: expect.objectContaining({
        status: "preReviewPending",
      }),
      select: { id: true },
    });
  });

  it("非公開リンクを削除して同じURLを新規登録しても保存しない", async () => {
    const blockedUrl = "https://youtube.com/@blocked";
    const existingProfile = {
      id: "profile-1",
      userId: "testuser",
      authId: "auth-user-1",
      status: "active",
      accountModerationStatus: "active",
      displayName: "Test User",
      bio: "",
      audioTitle: "",
      theme: "normal",
      sns: [],
      moderationCases: [
        {
          snapshots: [
            {
              content: { url: blockedUrl },
              contentHash: await createModeratedUrlHash(blockedUrl),
            },
          ],
        },
      ],
    };
    mocks.profileFindUnique.mockResolvedValueOnce(existingProfile);

    const response = await POST(
      postRequest({
        userId: "testuser",
        displayName: "Test User",
        sns: [
          {
            service: "youtube",
            url: "https://YOUTUBE.com/@blocked/#profile",
            label: "YouTube",
          },
        ],
      }),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error:
        "過去に非公開となったリンクと同じURLです。別のURLを登録してください。",
    });
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.socialLinkCreate).not.toHaveBeenCalled();
  });

  it("ハッシュ未保存の旧ケースでもURLを正規化して再登録を拒否する", async () => {
    mocks.profileFindUnique.mockResolvedValueOnce({
      id: "profile-1",
      userId: "testuser",
      authId: "auth-user-1",
      status: "active",
      accountModerationStatus: "active",
      displayName: "Test User",
      bio: "",
      audioTitle: "",
      theme: "normal",
      sns: [],
      moderationCases: [
        {
          snapshots: [
            {
              content: { url: "https://youtube.com/@legacy/" },
              contentHash: null,
            },
          ],
        },
      ],
    });

    const response = await POST(
      postRequest({
        userId: "testuser",
        displayName: "Test User",
        sns: [
          {
            service: "youtube",
            url: "https://YOUTUBE.com/@legacy#same",
            label: "YouTube",
          },
        ],
      }),
    );

    expect(response.status).toBe(409);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("旧事後確認待ちのリンクを再編集すると非公開の事前確認へ移行する", async () => {
    const existingProfile = {
      id: "profile-1",
      userId: "testuser",
      authId: "auth-user-1",
      status: "active",
      accountModerationStatus: "active",
      displayName: "Test User",
      bio: "",
      audioTitle: "",
      theme: "normal",
      sns: [
        {
          id: "link-active",
          profileId: "profile-1",
          service: "youtube",
          url: "https://youtube.com/@first-correction",
          label: "YouTube",
          sortOrder: 0,
          status: "active",
        },
      ],
    };
    mocks.profileFindUnique.mockResolvedValueOnce(existingProfile);
    mocks.profileFindUnique.mockResolvedValueOnce(existingProfile);
    mocks.moderationCaseFindFirst.mockResolvedValueOnce({
      id: "case-link",
      status: "postReviewPending",
      reviewMode: "postReview",
    });
    mocks.moderationCaseUpdate.mockResolvedValueOnce({ id: "case-link" });
    mocks.moderationSnapshotFindFirst.mockResolvedValueOnce({
      id: "snapshot-reported",
    });

    const response = await POST(
      postRequest({
        userId: "testuser",
        displayName: "Test User",
        sns: [
          {
            id: "link-active",
            service: "youtube",
            url: "https://youtube.com/@second-correction",
            label: "YouTube",
          },
        ],
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.socialLinkUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "hidden" }),
      }),
    );
    expect(mocks.moderationCaseUpdate).toHaveBeenCalledWith({
      where: { id: "case-link" },
      data: expect.objectContaining({
        reviewMode: "preReview",
        status: "preReviewPending",
      }),
      select: { id: true },
    });
    expect(mocks.moderationSnapshotCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        moderationCaseId: "case-link",
        kind: "corrected",
        content: {
          service: "youtube",
          url: "https://youtube.com/@second-correction",
          label: "YouTube",
        },
      }),
    });
    expect(mocks.moderationCaseEventCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        previousStatus: "postReviewPending",
        newStatus: "preReviewPending",
      }),
    });
  });

  it("非公開リンクを削除すると削除履歴を残す", async () => {
    const existingProfile = {
      id: "profile-1",
      userId: "testuser",
      authId: "auth-user-1",
      status: "active",
      accountModerationStatus: "active",
      displayName: "Test User",
      bio: "",
      audioStatus: "active",
      audioTitle: "",
      audioUrl: "",
      theme: "normal",
      sns: [
        {
          id: "link-hidden",
          profileId: "profile-1",
          service: "youtube",
          url: "https://youtube.com/@before",
          label: "YouTube",
          sortOrder: 0,
          status: "hidden",
        },
      ],
    };
    mocks.profileFindUnique.mockResolvedValueOnce(existingProfile);
    mocks.profileFindUnique.mockResolvedValueOnce({
      ...existingProfile,
      sns: [],
    });
    mocks.moderationCaseFindFirst.mockResolvedValueOnce({
      id: "case-link",
      status: "correctionRequired",
      reviewMode: "postReview",
    });
    mocks.moderationCaseUpdate.mockResolvedValueOnce({ id: "case-link" });
    mocks.moderationSnapshotFindFirst.mockResolvedValueOnce({
      id: "snapshot-reported",
    });

    const response = await POST(
      postRequest({
        userId: "testuser",
        displayName: "Test User",
        sns: [],
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.socialLinkDelete).toHaveBeenCalledWith({
      where: { id: "link-hidden" },
    });
    expect(mocks.moderationSnapshotCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        moderationCaseId: "case-link",
        kind: "corrected",
        content: { deleted: true },
      }),
    });
    expect(mocks.moderationCaseEventCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventType: "contentDeleted",
        newStatus: "preReviewPending",
      }),
    });
  });

  it("既存プロフィール更新時にthemeとSNS serviceを正規化し、SNSを置き換える", async () => {
    const existingProfile = {
      id: "profile-1",
      userId: "testuser",
      authId: "auth-user-1",
      displayName: "Old",
      bio: "",
      audioUrl: "",
      audioTitle: "",
      theme: "dark",
      sns: [
        {
          id: "link-1",
          profileId: "profile-1",
          service: "website",
          url: "https://before.example.com",
          label: "Before",
          sortOrder: 0,
          status: "active",
        },
      ],
    };
    const savedProfile = {
      ...existingProfile,
      displayName: "New",
      theme: "normal",
      sns: [
        {
          profileId: "profile-1",
          service: "other",
          url: "https://example.com",
          label: "Site",
          sortOrder: 0,
        },
      ],
    };

    mocks.profileFindUnique.mockResolvedValueOnce(existingProfile);
    mocks.profileUpdate.mockResolvedValueOnce({ ...existingProfile, displayName: "New" });
    mocks.profileFindUnique.mockResolvedValueOnce(savedProfile);

    const response = await POST(
      postRequest({
        userId: "testuser",
        displayName: "New",
        theme: "unknown",
        sns: [{ service: "mastodon", url: "https://example.com", label: "Site" }],
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual(savedProfile);
    expect(mocks.profileUpdate).toHaveBeenCalledWith({
      where: { userId: "testuser" },
      data: {
        displayName: "New",
        bio: "",
        audioTitle: "",
        theme: "normal",
      },
      include: { sns: true },
    });
    expect(mocks.socialLinkUpdate).toHaveBeenCalledWith({
      where: { id: "link-1" },
      data: {
        service: "other",
        url: "https://example.com",
        label: "Site",
        sortOrder: 0,
        status: "active",
      },
    });
  });

  it("プロフィール保存ではクライアント指定の音声保存先を更新しない", async () => {
    const existingProfile = {
      id: "profile-1",
      userId: "testuser",
      authId: "auth-user-1",
      displayName: "Old",
      bio: "",
      audioUrl: "",
      audioKey: "audio/testuser/current.m4a",
      audioTitle: "",
      theme: "normal",
      sns: [],
    };

    mocks.profileFindUnique.mockResolvedValueOnce(existingProfile);
    mocks.profileUpdate.mockResolvedValueOnce(existingProfile);
    mocks.profileFindUnique.mockResolvedValueOnce(existingProfile);

    const response = await POST(
      postRequest({
        userId: "testuser",
        displayName: "Old",
        audioUrl: "https://attacker.example/audio.m4a",
        audioKey: "audio/testuser/untrusted.m4a",
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.profileUpdate).toHaveBeenCalledWith({
      where: { userId: "testuser" },
      data: {
        displayName: "Old",
        bio: "",
        audioTitle: "",
        theme: "normal",
      },
      include: { sns: true },
    });
  });

  it("authId未設定の既存プロフィールは更新も自動取得も拒否する", async () => {
    const legacyProfile = {
      id: "profile-legacy",
      userId: "legacy",
      authId: null,
      displayName: "Legacy",
      bio: "",
      audioUrl: "",
      audioTitle: "",
      theme: "normal",
      sns: [],
    };

    mocks.profileFindUnique.mockResolvedValueOnce(legacyProfile);

    const response = await POST(
      postRequest({
        userId: "legacy",
        displayName: "Legacy",
      }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "別のユーザーのプロフィールを変更する権限がありません。",
    });
    expect(mocks.profileUpdate).not.toHaveBeenCalled();
    expect(mocks.socialLinkDeleteMany).not.toHaveBeenCalled();
  });

  it("同一認証ユーザーが別userIdで新規作成しようとした場合は拒否する", async () => {
    mocks.profileFindUnique.mockResolvedValueOnce(null);
    mocks.profileFindUnique.mockResolvedValueOnce({
      id: "profile-existing",
      userId: "already-used",
      authId: "auth-user-1",
    });

    const response = await POST(
      postRequest({
        userId: "new-user-id",
        displayName: "New User",
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "このアカウントはすでに別のユーザーIDで登録されています。",
    });
    expect(mocks.profileCreate).not.toHaveBeenCalled();
    expect(mocks.socialLinkDeleteMany).not.toHaveBeenCalled();
  });

  it("再登録禁止対象のプロフィール作成を拒否してAuthユーザーを削除する", async () => {
    mocks.profileFindUnique.mockResolvedValueOnce(null);
    mocks.profileFindUnique.mockResolvedValueOnce(null);
    mocks.isRegistrationBanned.mockResolvedValueOnce(true);

    const response = await POST(
      postRequest({
        userId: "banned-user",
        displayName: "Banned User",
      }),
    );

    expect(response.status).toBe(403);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    await expect(response.json()).resolves.toEqual({
      error: "このアカウントは利用できません。",
    });
    expect(mocks.isRegistrationBanned).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "auth-user-1",
        email: "user@example.com",
      }),
    );
    expect(mocks.deleteUser).toHaveBeenCalledWith("auth-user-1");
    expect(mocks.profileCreate).not.toHaveBeenCalled();
  });

  it("プロフィール保存の内部エラーをレスポンスへ公開しない", async () => {
    const internalError = new Error(
      "duplicate key value violates unique constraint Profile_authId_key",
    );
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.profileFindUnique.mockRejectedValueOnce(internalError);

    try {
      const response = await POST(
        postRequest({ userId: "testuser", displayName: "Test User" }),
      );

      expect(response.status).toBe(500);
      await expect(response.json()).resolves.toEqual({
        error: "プロフィールの保存に失敗しました。",
      });
      expect(consoleError).toHaveBeenCalledWith(
        "Failed to save profile",
        internalError,
      );
    } finally {
      consoleError.mockRestore();
    }
  });
});
