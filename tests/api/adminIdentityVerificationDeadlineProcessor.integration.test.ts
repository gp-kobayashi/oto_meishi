import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authorizeAdminRequest: vi.fn(),
  consumeAdminActionRateLimit: vi.fn(),
  consumeAdminActionIpRateLimit: vi.fn(),
  getClientIp: vi.fn(),
}));

vi.mock("@/lib/adminAuth", () => ({
  authorizeAdminRequest: mocks.authorizeAdminRequest,
}));
vi.mock("@/lib/adminActionRateLimit", () => ({
  consumeAdminActionRateLimit: mocks.consumeAdminActionRateLimit,
  consumeAdminActionIpRateLimit: mocks.consumeAdminActionIpRateLimit,
}));
vi.mock("@/lib/clientIp", () => ({ getClientIp: mocks.getClientIp }));

import { PATCH } from "@/app/(site)/api/admin/moderation/identity-verification/[requestId]/route";
import { prisma } from "@/lib/prisma";
import { processModerationDeadlines } from "@/lib/moderationDeadlineProcessor";

describe("本人確認申請期限処理の統合テスト", () => {
  const runId = crypto.randomUUID();
  let profileId = "";
  let adminUserId = "";
  let expiredRequestId = "";
  let expiredCaseId = "";
  let protectedCaseId = "";

  beforeAll(async () => {
    const admin = await prisma.adminUser.create({
      data: { authId: `identity-deadline-admin-${runId}`, role: "admin" },
      select: { id: true },
    });
    adminUserId = admin.id;
    mocks.authorizeAdminRequest.mockResolvedValue({
      ok: true,
      admin: {
        id: adminUserId,
        authId: `identity-deadline-admin-${runId}`,
        role: "admin",
      },
    });
    mocks.consumeAdminActionRateLimit.mockReturnValue({ allowed: true });
    mocks.consumeAdminActionIpRateLimit.mockReturnValue({ allowed: true });
    mocks.getClientIp.mockReturnValue(null);

    const profile = await prisma.profile.create({
      data: {
        userId: `identity-deadline-profile-${runId}`,
        displayName: "本人確認期限処理テスト",
        bio: "統合テスト用",
        theme: "normal",
        audioUrl: "",
        audioTitle: "",
        status: "hidden",
      },
      select: { id: true },
    });
    profileId = profile.id;
    const expiredAt = new Date(Date.now() - 10 * 60_000);
    const deadline = new Date(Date.now() - 60_000);
    const expiredCase = await prisma.moderationCase.create({
      data: {
        profileId,
        targetType: "profile",
        targetId: profileId,
        reasonCode: "impersonation",
        reviewMode: "preReview",
        status: "preReviewPending",
        userMessage: "期限処理テスト",
      },
      select: { id: true },
    });
    expiredCaseId = expiredCase.id;
    const expiredRequest = await prisma.identityVerificationRequest.create({
      data: {
        profileId,
        moderationCaseId: expiredCase.id,
        socialUrl: "https://example.com/expired",
        plannedContent: "期限切れ申請",
        postingDeadlineAt: deadline,
        createdAt: expiredAt,
      },
      select: { id: true },
    });
    expiredRequestId = expiredRequest.id;

    const protectedCase = await prisma.moderationCase.create({
      data: {
        profileId,
        targetType: "socialLink",
        targetId: `protected-target-${runId}`,
        reasonCode: "impersonation",
        reviewMode: "preReview",
        status: "preReviewPending",
        userMessage: "新規申請保護テスト",
      },
      select: { id: true },
    });
    protectedCaseId = protectedCase.id;
    await prisma.identityVerificationRequest.create({
      data: {
        profileId,
        moderationCaseId: protectedCase.id,
        socialUrl: "https://example.com/current",
        plannedContent: "有効な申請",
        postingDeadlineAt: new Date(Date.now() + 10 * 60_000),
      },
    });
    await prisma.identityVerificationRequest.create({
      data: {
        profileId,
        moderationCaseId: protectedCase.id,
        socialUrl: "https://example.com/old",
        plannedContent: "過去の申請",
        postingDeadlineAt: deadline,
        status: "expired",
        createdAt: expiredAt,
      },
    });
  });

  afterAll(async () => {
    try {
      if (profileId) {
        await prisma.profile.deleteMany({ where: { id: profileId } });
      }
      if (adminUserId) {
        await prisma.adminUser.deleteMany({ where: { id: adminUserId } });
      }
    } finally {
      await prisma.$disconnect();
    }
  }, 15_000);

  it("期限処理と期限切れ申請の管理審査が競合しても安全に終わる", async () => {
    const adminReview = PATCH(
      new Request(
        `http://localhost/api/admin/moderation/identity-verification/${expiredRequestId}`,
        {
          method: "PATCH",
          headers: {
            Authorization: "Bearer integration-admin-token",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ decision: "verified", note: "期限確認" }),
        },
      ),
      { params: Promise.resolve({ requestId: expiredRequestId }) },
    );
    const deadlineProcessing = processModerationDeadlines(new Date());
    const [reviewResponse] = await Promise.all([
      adminReview,
      deadlineProcessing,
    ]);

    expect(reviewResponse.status).toBe(409);
    await expect(
      prisma.identityVerificationRequest.findUnique({
        where: { id: expiredRequestId },
        select: { status: true },
      }),
    ).resolves.toEqual({ status: "expired" });
    await expect(
      prisma.moderationCase.findUnique({
        where: { id: expiredCaseId },
        select: { status: true },
      }),
    ).resolves.toEqual({ status: "correctionRequired" });
    await expect(
      prisma.moderationCase.findUnique({
        where: { id: protectedCaseId },
        select: { status: true },
      }),
    ).resolves.toEqual({ status: "preReviewPending" });
  });
});
