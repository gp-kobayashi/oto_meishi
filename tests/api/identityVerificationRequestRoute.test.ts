import { beforeEach, describe, expect, it, vi } from "vitest";

const { mocks } = vi.hoisted(() => ({
  mocks: {
    authorize: vi.fn(),
    transaction: vi.fn(),
    profileFindUnique: vi.fn(),
    caseFindFirst: vi.fn(),
    socialLinkFindFirst: vi.fn(),
    verificationUpdateMany: vi.fn(),
    verificationCreate: vi.fn(),
    userRateLimit: vi.fn(),
    ipRateLimit: vi.fn(),
    getClientIp: vi.fn(),
    lockModerationProfile: vi.fn(),
    caseUpdateMany: vi.fn(),
  },
}));

vi.mock("@/lib/profileOwnerAuth", () => ({
  authorizeProfileOwnerRequest: mocks.authorize,
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: mocks.transaction,
    profile: { findUnique: mocks.profileFindUnique },
    moderationCase: { findFirst: mocks.caseFindFirst },
    socialLink: { findFirst: mocks.socialLinkFindFirst },
    identityVerificationRequest: {
      updateMany: mocks.verificationUpdateMany,
      create: mocks.verificationCreate,
    },
  },
}));
vi.mock("@/lib/moderationRequestRateLimit", () => ({
  consumeModerationRequestUserRateLimit: mocks.userRateLimit,
  consumeModerationRequestIpRateLimit: mocks.ipRateLimit,
}));
vi.mock("@/lib/clientIp", () => ({ getClientIp: mocks.getClientIp }));
vi.mock("@/lib/moderationTransactionLock", () => ({
  lockModerationProfile: mocks.lockModerationProfile,
}));

import {
  GET,
  POST,
} from "@/app/(site)/api/moderation/identity-verification/route";

const caseId = "11111111-1111-4111-8111-111111111111";
const socialLinkId = "22222222-2222-4222-8222-222222222222";

const request = (body?: unknown) =>
  new Request("http://localhost/api/moderation/identity-verification", {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Authorization: "Bearer token",
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

describe("/api/moderation/identity-verification", () => {
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
    mocks.lockModerationProfile.mockResolvedValue(undefined);
    mocks.caseUpdateMany.mockResolvedValue({ count: 1 });
    mocks.caseFindFirst.mockResolvedValue({ id: caseId });
    mocks.socialLinkFindFirst.mockResolvedValue({
      id: socialLinkId,
      url: "https://x.com/example",
    });
    mocks.verificationUpdateMany.mockResolvedValue({ count: 0 });
    mocks.verificationCreate.mockImplementation(
      ({ data }: { data: { postingDeadlineAt: Date } }) =>
        Promise.resolve({
          id: "33333333-3333-4333-8333-333333333333",
          moderationCaseId: caseId,
          socialLinkId,
          socialUrl: "https://x.com/example",
          plannedContent: "確認用の投稿を行います。",
          status: "pending",
          postingDeadlineAt: data.postingDeadlineAt,
          reviewNote: "",
          reviewedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
    );
    mocks.transaction.mockImplementation(async (operation: unknown) => {
      if (typeof operation === "function") {
        return operation({
          identityVerificationRequest: {
            updateMany: mocks.verificationUpdateMany,
            create: mocks.verificationCreate,
          },
          moderationCase: { updateMany: mocks.caseUpdateMany },
        });
      }
      return Promise.all(operation as Promise<unknown>[]);
    });
  });

  it("なりすましケースと登録SNSと申請履歴を返す", async () => {
    mocks.profileFindUnique.mockResolvedValue({
      moderationCases: [
        {
          id: caseId,
          status: "correctionRequired",
          userMessage: "本人確認が必要です。",
          createdAt: new Date("2026-08-09T00:00:00.000Z"),
        },
      ],
      sns: [
        {
          id: socialLinkId,
          service: "x",
          label: "X",
          url: "https://x.com/example",
          status: "active",
        },
      ],
      identityVerificationRequests: [],
    });

    const response = await GET(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      cases: [{ id: caseId }],
      socialLinks: [{ id: socialLinkId, service: "x" }],
      requests: [],
    });
  });

  it("投稿予定を申請し10分後の期限を設定する", async () => {
    const before = Date.now();

    const response = await POST(
      request({
        moderationCaseId: caseId,
        socialLinkId,
        plannedContent: " 確認用の投稿を行います。 ",
      }),
    );
    const result = await response.json();

    expect(response.status).toBe(201);
    expect(result.status).toBe("pending");
    expect(new Date(result.postingDeadlineAt).getTime()).toBeGreaterThanOrEqual(
      before + 10 * 60 * 1000,
    );
    expect(mocks.verificationUpdateMany).toHaveBeenCalledWith({
      where: {
        moderationCaseId: caseId,
        status: "pending",
        postingDeadlineAt: { lte: expect.any(Date) },
      },
      data: { status: "expired" },
    });
    expect(
      mocks.lockModerationProfile.mock.invocationCallOrder[0],
    ).toBeLessThan(mocks.verificationUpdateMany.mock.invocationCallOrder[0]);
    expect(mocks.caseUpdateMany).toHaveBeenCalledWith({
      where: { id: caseId, status: "correctionRequired" },
      data: { status: "preReviewPending" },
    });
    expect(mocks.caseUpdateMany.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.verificationCreate.mock.invocationCallOrder[0],
    );
    expect(mocks.verificationCreate.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.verificationUpdateMany.mock.invocationCallOrder[0],
    );
    expect(mocks.verificationCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          profileId: "profile-1",
          moderationCaseId: caseId,
          socialLinkId,
          socialUrl: "https://x.com/example",
          plannedContent: "確認用の投稿を行います。",
        }),
      }),
    );
  });

  it("本人所有ではないなりすましケースを拒否する", async () => {
    mocks.caseFindFirst.mockResolvedValueOnce(null);

    const response = await POST(
      request({
        moderationCaseId: caseId,
        socialLinkId,
        plannedContent: "確認用の投稿を行います。",
      }),
    );

    expect(response.status).toBe(403);
    expect(mocks.verificationCreate).not.toHaveBeenCalled();
  });

  it("登録されていないSNSリンクを拒否する", async () => {
    mocks.socialLinkFindFirst.mockResolvedValueOnce(null);

    const response = await POST(
      request({
        moderationCaseId: caseId,
        socialLinkId,
        plannedContent: "確認用の投稿を行います。",
      }),
    );

    expect(response.status).toBe(400);
    expect(mocks.verificationCreate).not.toHaveBeenCalled();
  });

  it("投稿予定内容を500文字以内に制限する", async () => {
    const response = await POST(
      request({
        moderationCaseId: caseId,
        socialLinkId,
        plannedContent: "あ".repeat(501),
      }),
    );

    expect(response.status).toBe(400);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
