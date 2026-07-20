import { beforeEach, describe, expect, it, vi } from "vitest";

const { mocks } = vi.hoisted(() => ({
  mocks: {
    getUser: vi.fn(),
    profileFindUnique: vi.fn(),
    profileCreate: vi.fn(),
    profileUpdate: vi.fn(),
    socialLinkDeleteMany: vi.fn(),
    socialLinkCreateMany: vi.fn(),
    transaction: vi.fn(),
    consumeProfileSaveUserRateLimit: vi.fn(),
    consumeProfileSaveIpRateLimit: vi.fn(),
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
      findUnique: mocks.profileFindUnique,
      create: mocks.profileCreate,
      update: mocks.profileUpdate,
    },
    socialLink: {
      deleteMany: mocks.socialLinkDeleteMany,
      createMany: mocks.socialLinkCreateMany,
    },
  },
}));

vi.mock("@/lib/profileSaveRateLimit", () => ({
  consumeProfileSaveUserRateLimit: mocks.consumeProfileSaveUserRateLimit,
  consumeProfileSaveIpRateLimit: mocks.consumeProfileSaveIpRateLimit,
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
      data: { user: { id: "auth-user-1" } },
      error: null,
    });
    mocks.socialLinkDeleteMany.mockResolvedValue({ count: 0 });
    mocks.socialLinkCreateMany.mockResolvedValue({ count: 0 });
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
      include: { sns: true },
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

  it("公開中の音声は保存先を隠して存在だけを返す", async () => {
    mocks.profileFindUnique.mockResolvedValueOnce({
      id: "profile-1",
      userId: "testuser",
      authId: "auth-user-1",
      status: "active",
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

  it("管理対応中のプロフィールはユーザー自身でも変更できない", async () => {
    mocks.profileFindUnique.mockResolvedValueOnce({
      id: "profile-1",
      userId: "testuser",
      authId: "auth-user-1",
      status: "hidden",
      audioStatus: "active",
      audioUrl: "",
      sns: [],
    });

    const response = await POST(
      postRequest({ userId: "testuser", displayName: "変更後" }),
    );

    expect(response.status).toBe(403);
    expect(mocks.profileUpdate).not.toHaveBeenCalled();
    expect(mocks.socialLinkDeleteMany).not.toHaveBeenCalled();
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
      sns: [{ id: "link-1" }],
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
    expect(mocks.socialLinkDeleteMany).toHaveBeenCalledWith({
      where: { profileId: "profile-1" },
    });
    expect(mocks.socialLinkCreateMany).toHaveBeenCalledWith({
      data: [
        {
          profileId: "profile-1",
          service: "other",
          url: "https://example.com",
          label: "Site",
          sortOrder: 0,
        },
      ],
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
