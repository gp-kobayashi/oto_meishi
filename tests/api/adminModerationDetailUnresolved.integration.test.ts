import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authorizeAdminRequest: vi.fn(),
}));

vi.mock("@/lib/adminAuth", () => ({
  authorizeAdminRequest: mocks.authorizeAdminRequest,
}));

import { GET } from "@/app/(site)/api/admin/moderation/[profileId]/route";
import { prisma } from "@/lib/prisma";

describe("管理詳細の未処理項目取得統合テスト", () => {
  const runId = crypto.randomUUID();
  let profileId = "";
  let adminUserId = "";

  beforeAll(async () => {
    const admin = await prisma.adminUser.create({
      data: { authId: `detail-unresolved-admin-${runId}`, role: "admin" },
      select: { id: true },
    });
    adminUserId = admin.id;
    mocks.authorizeAdminRequest.mockResolvedValue({
      ok: true,
      admin: {
        id: adminUserId,
        authId: `detail-unresolved-admin-${runId}`,
        role: "admin",
      },
    });

    const profile = await prisma.profile.create({
      data: {
        userId: `detail-unresolved-profile-${runId}`,
        displayName: "未処理項目取得確認用",
        bio: "統合テスト用",
        theme: "normal",
        audioUrl: "",
        audioTitle: "",
      },
      select: { id: true },
    });
    profileId = profile.id;

    const completedAt = new Date("2026-08-31T00:00:00.000Z");
    const futureDeadline = new Date("2027-01-01T00:00:00.000Z");
    const unresolvedAt = new Date("2020-01-01T00:00:00.000Z");
    await prisma.contentReport.createMany({
      data: [
        ...Array.from({ length: 51 }, (_, index) => ({
          profileId,
          targetType: "profile" as const,
          targetId: profileId,
          targetSnapshot: { source: "integration", index },
          reason: "other" as const,
          details: `完了通報-${index}-${runId}`,
          status: "dismissed" as const,
          createdAt: new Date(completedAt.getTime() + index * 1000),
        })),
        {
          profileId,
          targetType: "profile" as const,
          targetId: profileId,
          targetSnapshot: { source: "integration", old: true },
          reason: "other" as const,
          details: `古い未処理通報-${runId}`,
          status: "reviewed" as const,
          createdAt: unresolvedAt,
        },
      ],
    });

    await prisma.moderationRequest.createMany({
      data: [
        ...Array.from({ length: 51 }, (_, index) => ({
          profileId,
          kind: "accountAppeal" as const,
          status: "resolved" as const,
          message: `完了解除申請-${index}-${runId}`,
          resolvedAt: completedAt,
          createdAt: new Date(completedAt.getTime() + index * 1000),
        })),
        {
          profileId,
          kind: "accountAppeal" as const,
          status: "pending" as const,
          message: `古い未処理解除申請-${runId}`,
          createdAt: unresolvedAt,
        },
      ],
    });

    const completedCases = await Promise.all(
      Array.from({ length: 51 }, (_, index) =>
        prisma.moderationCase.create({
          data: {
            profileId,
            targetType: "profile",
            targetId: profileId,
            reasonCode: "other",
            reviewMode: "preReview",
            status: "confirmed",
            resolvedAt: completedAt,
            userMessage: `完了ケース-${index}-${runId}`,
            createdAt: new Date(completedAt.getTime() + index * 1000),
          },
          select: { id: true },
        }),
      ),
    );
    await prisma.moderationCase.create({
      data: {
        profileId,
        targetType: "profile",
        targetId: profileId,
        reasonCode: "other",
        reviewMode: "preReview",
        status: "preReviewPending",
        userMessage: `古い未処理ケース-${runId}`,
        createdAt: unresolvedAt,
      },
    });

    await prisma.identityVerificationRequest.createMany({
      data: [
        ...completedCases.map((moderationCase, index) => ({
          profileId,
          moderationCaseId: moderationCase.id,
          socialUrl: "https://example.com/evidence",
          plannedContent: "統合テスト",
          status: "verified" as const,
          postingDeadlineAt: futureDeadline,
          reviewedByAdminUserId: adminUserId,
          reviewedAt: completedAt,
          reviewNote: "統合テスト確認済み",
          createdAt: new Date(completedAt.getTime() + index * 1000),
        })),
      ],
    });
    const unresolvedCase = await prisma.moderationCase.findFirstOrThrow({
      where: { profileId, status: "preReviewPending" },
      select: { id: true },
    });
    await prisma.identityVerificationRequest.create({
      data: {
        profileId,
        moderationCaseId: unresolvedCase.id,
        socialUrl: "https://example.com/evidence-old",
        plannedContent: "統合テスト",
        status: "pending",
        postingDeadlineAt: futureDeadline,
        createdAt: unresolvedAt,
      },
    });
  });

  afterAll(async () => {
    try {
      await prisma.$transaction(async (tx) => {
        await tx.profile.deleteMany({ where: { id: profileId } });
        await tx.adminUser.deleteMany({ where: { id: adminUserId } });
      });
    } finally {
      await prisma.$disconnect();
    }
  }, 15_000);

  it("51件目以降でも未処理項目を重複なく返す", async () => {
    const response = await GET(
      new Request(`http://localhost/api/admin/moderation/${profileId}`),
      { params: Promise.resolve({ profileId }) },
    );
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result.profile.reports).toHaveLength(51);
    expect(result.profile.reports.at(-1).details).toContain("古い未処理通報");
    expect(result.profile.moderationRequests).toHaveLength(51);
    expect(result.profile.moderationRequests.at(-1).message).toContain(
      "古い未処理解除申請",
    );
    expect(result.profile.moderationCases).toHaveLength(51);
    expect(result.profile.moderationCases.at(-1).userMessage).toContain(
      "古い未処理ケース",
    );
    expect(result.profile.identityVerificationRequests).toHaveLength(51);
    expect(
      result.profile.identityVerificationRequests.at(-1).socialUrl,
    ).toContain("evidence-old");

    for (const collection of [
      result.profile.reports,
      result.profile.moderationRequests,
      result.profile.moderationCases,
      result.profile.identityVerificationRequests,
    ]) {
      expect(
        new Set(collection.map((item: { id: string }) => item.id)).size,
      ).toBe(collection.length);
      for (let index = 1; index < collection.length; index += 1) {
        const previous = collection[index - 1];
        const current = collection[index];
        expect(previous.createdAt >= current.createdAt).toBe(true);
        if (previous.createdAt === current.createdAt) {
          expect(previous.id >= current.id).toBe(true);
        }
      }
    }
  });
});
