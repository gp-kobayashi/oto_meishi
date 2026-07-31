import { beforeEach, describe, expect, it, vi } from "vitest";

const { mocks } = vi.hoisted(() => ({
  mocks: {
    authorize: vi.fn(),
    transaction: vi.fn(),
    profileFindUnique: vi.fn(),
    requestFindMany: vi.fn(),
    requestFindFirst: vi.fn(),
    requestCreate: vi.fn(),
    userRateLimit: vi.fn(),
    ipRateLimit: vi.fn(),
    getClientIp: vi.fn(),
  },
}));

vi.mock("@/lib/profileOwnerAuth", () => ({
  authorizeProfileOwnerRequest: mocks.authorize,
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: mocks.transaction,
    profile: { findUnique: mocks.profileFindUnique },
    moderationRequest: {
      findMany: mocks.requestFindMany,
      findFirst: mocks.requestFindFirst,
      create: mocks.requestCreate,
    },
  },
}));
vi.mock("@/lib/moderationRequestRateLimit", () => ({
  consumeModerationRequestUserRateLimit: mocks.userRateLimit,
  consumeModerationRequestIpRateLimit: mocks.ipRateLimit,
}));
vi.mock("@/lib/clientIp", () => ({ getClientIp: mocks.getClientIp }));

import {
  GET,
  POST,
} from "@/app/(site)/api/moderation/requests/route";

const request = (body?: unknown) =>
  new Request("http://localhost/api/moderation/requests", {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Authorization: "Bearer token",
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const activeModerationProfile = {
  status: "hidden",
  accountModerationStatus: "active",
  suspensionAppealDueAt: null,
  audioStatus: "active",
  sns: [],
  moderationCases: [{ id: "case-1" }],
};

describe("/api/moderation/requests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorize.mockResolvedValue({
      ok: true,
      userId: "auth-user-1",
      profileId: "profile-1",
    });
    mocks.userRateLimit.mockReturnValue({
      allowed: true,
      retryAfterSeconds: 86_400,
    });
    mocks.ipRateLimit.mockReturnValue({
      allowed: true,
      retryAfterSeconds: 86_400,
    });
    mocks.getClientIp.mockReturnValue(null);
    mocks.profileFindUnique.mockResolvedValue(activeModerationProfile);
    mocks.requestFindMany.mockReturnValue("requests-query");
    mocks.transaction.mockResolvedValue([activeModerationProfile, []]);
    mocks.requestFindFirst.mockResolvedValue(null);
    mocks.requestCreate.mockResolvedValue({
      id: "request-1",
      kind: "inquiry",
      status: "pending",
      message: "修正方法を確認したいです。",
      responseMessage: "",
      resolvedAt: null,
      createdAt: new Date("2026-07-31T05:00:00.000Z"),
      updatedAt: new Date("2026-07-31T05:00:00.000Z"),
    });
  });

  it("非公開コンテンツの問い合わせ資格と履歴を返す", async () => {
    mocks.transaction.mockResolvedValueOnce([
      activeModerationProfile,
      [
        {
          id: "request-1",
          kind: "inquiry",
          status: "resolved",
          message: "修正方法を確認したいです。",
          responseMessage: "編集画面からURLを変更してください。",
          resolvedAt: new Date("2026-07-31T06:00:00.000Z"),
          createdAt: new Date("2026-07-31T05:00:00.000Z"),
          updatedAt: new Date("2026-07-31T06:00:00.000Z"),
        },
      ],
    ]);

    const response = await GET(request());
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result.eligibility).toEqual({
      kind: "inquiry",
      suspensionAppealDueAt: null,
    });
    expect(result.requests[0]).toEqual(
      expect.objectContaining({
        responseMessage: "編集画面からURLを変更してください。",
        resolvedAt: "2026-07-31T06:00:00.000Z",
      }),
    );
  });

  it("利用停止中は60日以内の解除申請を受け付ける", async () => {
    const dueAt = new Date(Date.now() + 60_000);
    mocks.profileFindUnique.mockResolvedValueOnce({
      ...activeModerationProfile,
      status: "suspended",
      accountModerationStatus: "suspended",
      suspensionAppealDueAt: dueAt,
    });
    mocks.requestCreate.mockResolvedValueOnce({
      id: "request-appeal",
      kind: "accountAppeal",
      status: "pending",
      message: "問題箇所を確認しました。",
      responseMessage: "",
      resolvedAt: null,
      createdAt: new Date("2026-07-31T05:00:00.000Z"),
      updatedAt: new Date("2026-07-31T05:00:00.000Z"),
    });

    const response = await POST(
      request({ message: "問題箇所を確認しました。" }),
    );
    const result = await response.json();

    expect(response.status).toBe(201);
    expect(result.kind).toBe("accountAppeal");
    expect(mocks.requestCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          profileId: "profile-1",
          kind: "accountAppeal",
          message: "問題箇所を確認しました。",
        },
      }),
    );
  });

  it("申請期間を過ぎた利用停止解除申請を拒否する", async () => {
    mocks.profileFindUnique.mockResolvedValueOnce({
      ...activeModerationProfile,
      status: "suspended",
      accountModerationStatus: "suspended",
      suspensionAppealDueAt: new Date(Date.now() - 1),
    });

    const response = await POST(request({ message: "解除を希望します。" }));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "利用停止から60日間の申請期間を過ぎています。",
    });
    expect(mocks.requestCreate).not.toHaveBeenCalled();
  });

  it("確認中の同種申請がある場合は重複送信を拒否する", async () => {
    mocks.requestFindFirst.mockResolvedValueOnce({ id: "pending-request" });

    const response = await POST(request({ message: "確認したいです。" }));

    expect(response.status).toBe(409);
    expect(mocks.requestCreate).not.toHaveBeenCalled();
  });

  it("対象となる対応がない場合は問い合わせを拒否する", async () => {
    mocks.profileFindUnique.mockResolvedValueOnce({
      status: "active",
      accountModerationStatus: "active",
      suspensionAppealDueAt: null,
      audioStatus: "active",
      sns: [],
      moderationCases: [],
    });

    const response = await POST(request({ message: "問い合わせです。" }));

    expect(response.status).toBe(403);
    expect(mocks.requestCreate).not.toHaveBeenCalled();
  });

  it("ユーザー送信上限では再送可能までの秒数を返す", async () => {
    mocks.userRateLimit.mockReturnValueOnce({
      allowed: false,
      retryAfterSeconds: 3600,
    });

    const response = await POST(request({ message: "問い合わせです。" }));
    const result = await response.json();

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("3600");
    expect(result.retryAfterSeconds).toBe(3600);
    expect(mocks.profileFindUnique).not.toHaveBeenCalled();
  });

  it("未認証の場合は申請を取得・作成しない", async () => {
    mocks.authorize.mockResolvedValueOnce({
      ok: false,
      response: Response.json({ error: "認証が必要です。" }, { status: 401 }),
    });

    const response = await GET(request());

    expect(response.status).toBe(401);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
