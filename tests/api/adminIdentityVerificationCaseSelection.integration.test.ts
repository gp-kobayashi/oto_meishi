import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authorizeAdminRequest: vi.fn(),
  authorizeProfileOwnerRequest: vi.fn(),
  consumeAdminActionRateLimit: vi.fn(),
  consumeAdminActionIpRateLimit: vi.fn(),
  consumeModerationRequestUserRateLimit: vi.fn(),
  consumeModerationRequestIpRateLimit: vi.fn(),
}));

vi.mock("@/lib/adminAuth", () => ({
  authorizeAdminRequest: mocks.authorizeAdminRequest,
}));
vi.mock("@/lib/profileOwnerAuth", () => ({
  authorizeProfileOwnerRequest: mocks.authorizeProfileOwnerRequest,
}));
vi.mock("@/lib/adminActionRateLimit", () => ({
  consumeAdminActionRateLimit: mocks.consumeAdminActionRateLimit,
  consumeAdminActionIpRateLimit: mocks.consumeAdminActionIpRateLimit,
}));
vi.mock("@/lib/clientIp", () => ({ getClientIp: () => null }));
vi.mock("@/lib/moderationRequestRateLimit", () => ({
  consumeModerationRequestUserRateLimit:
    mocks.consumeModerationRequestUserRateLimit,
  consumeModerationRequestIpRateLimit:
    mocks.consumeModerationRequestIpRateLimit,
}));

import { POST } from "@/app/(site)/api/moderation/identity-verification/route";
import { PATCH } from "@/app/(site)/api/admin/moderation/identity-verification/[requestId]/route";
import { prisma } from "@/lib/prisma";

describe("本人確認申請のケース・証拠SNS選択", () => {
  const runId = crypto.randomUUID();
  const adminAuthId = `case-selection-admin-${runId}`;
  let adminId = "";
  let profileId = "";
  let profileCaseId = "";
  let linkCaseAId = "";
  let linkCaseBId = "";
  let linkAId = "";
  let linkBId = "";
  let evidenceLinkId = "";
  const requestIds: string[] = [];

  beforeAll(async () => {
    const admin = await prisma.adminUser.create({
      data: { authId: adminAuthId, role: "admin" },
      select: { id: true },
    });
    adminId = admin.id;
    const profile = await prisma.profile.create({
      data: {
        userId: `case-selection-user-${runId}`,
        displayName: "ケース選択テスト",
        bio: "統合テスト用",
        theme: "normal",
        audioUrl: "",
        audioTitle: "",
        status: "active",
        accountModerationStatus: "active",
      },
      select: { id: true },
    });
    profileId = profile.id;
    const links = await prisma.socialLink.createManyAndReturn({
      data: [
        {
          profileId,
          service: "youtube",
          label: "対象リンクA",
          url: `https://youtube.com/a-${runId}`,
          status: "hidden",
        },
        {
          profileId,
          service: "x",
          label: "対象リンクB",
          url: `https://x.com/b-${runId}`,
          status: "hidden",
        },
        {
          profileId,
          service: "instagram",
          label: "証拠SNS",
          url: `https://instagram.com/e-${runId}`,
          status: "active",
        },
      ],
      select: { id: true },
    });
    [linkAId, linkBId, evidenceLinkId] = links.map((link) => link.id);
    const cases = await Promise.all([
      prisma.moderationCase.create({
        data: {
          profileId,
          targetType: "profile",
          targetId: profileId,
          reasonCode: "impersonation",
          reviewMode: "preReview",
          status: "preReviewPending",
          userMessage: "プロフィール確認",
        },
        select: { id: true },
      }),
      prisma.moderationCase.create({
        data: {
          profileId,
          targetType: "socialLink",
          targetId: linkAId,
          reasonCode: "impersonation",
          reviewMode: "preReview",
          status: "preReviewPending",
          userMessage: "リンクA確認",
        },
        select: { id: true },
      }),
      prisma.moderationCase.create({
        data: {
          profileId,
          targetType: "socialLink",
          targetId: linkBId,
          reasonCode: "impersonation",
          reviewMode: "preReview",
          status: "preReviewPending",
          userMessage: "リンクB確認",
        },
        select: { id: true },
      }),
    ]);
    [profileCaseId, linkCaseAId, linkCaseBId] = cases.map((item) => item.id);
    await prisma.moderationViolationEvent.createMany({
      data: cases.map((item) => ({
        profileId,
        moderationCaseId: item.id,
        adminUserId: adminId,
        eventType: "confirmed" as const,
        reasonCode: "impersonation" as const,
        suspensionTriggered: false,
        note: "テスト違反",
      })),
    });
    mocks.authorizeProfileOwnerRequest.mockResolvedValue({
      ok: true,
      profileId,
    });
    mocks.authorizeAdminRequest.mockResolvedValue({
      ok: true,
      admin: { id: adminId, authId: adminAuthId, role: "admin" },
    });
    mocks.consumeAdminActionRateLimit.mockReturnValue({ allowed: true });
    mocks.consumeAdminActionIpRateLimit.mockReturnValue({ allowed: true });
    mocks.consumeModerationRequestUserRateLimit.mockReturnValue({
      allowed: true,
    });
    mocks.consumeModerationRequestIpRateLimit.mockReturnValue({
      allowed: true,
    });
  });

  afterAll(async () => {
    try {
      await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`select set_config('app.account_deletion', 'enabled', true)`;
        await tx.moderationAction.deleteMany({ where: { profileId } });
        await tx.profile.deleteMany({ where: { id: profileId } });
        await tx.adminUser.deleteMany({ where: { id: adminId } });
      });
    } finally {
      await prisma.$disconnect();
    }
  }, 15_000);

  async function submitCase(moderationCaseId: string, socialLinkId: string) {
    const response = await POST(
      new Request("http://localhost/api/moderation/identity-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          moderationCaseId,
          socialLinkId,
          plannedContent: "確認投稿を行います。",
        }),
      }),
    );
    expect(response.status).toBe(201);
    const result = await response.json();
    requestIds.push(result.id);
    return result.id as string;
  }

  async function approve(requestId: string) {
    return PATCH(
      new Request(
        `http://localhost/api/admin/moderation/identity-verification/${requestId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            decision: "verified",
            note: "申請内容と投稿を確認しました。",
          }),
        },
      ),
      { params: Promise.resolve({ requestId }) },
    );
  }

  it("ケース順序が変わっても明示した対象ケースだけを審査・取消する", async () => {
    const profileRequestId = await submitCase(profileCaseId, evidenceLinkId);
    const linkARequestId = await submitCase(linkCaseAId, evidenceLinkId);
    const linkBRequestId = await submitCase(linkCaseBId, linkAId);

    await prisma.moderationCase.update({
      where: { id: profileCaseId },
      data: { updatedAt: new Date(Date.now() + 60_000) },
    });

    expect((await approve(linkARequestId)).status).toBe(200);
    const [midCases, midLinks, midRequests, midRevocations] = await Promise.all(
      [
        prisma.moderationCase.findMany({
          where: { id: { in: [profileCaseId, linkCaseAId, linkCaseBId] } },
          select: { id: true, status: true },
        }),
        prisma.socialLink.findMany({
          where: { id: { in: [linkAId, linkBId] } },
          select: { id: true, status: true },
        }),
        prisma.identityVerificationRequest.findMany({
          where: {
            id: { in: [profileRequestId, linkARequestId, linkBRequestId] },
          },
          select: {
            id: true,
            moderationCaseId: true,
            socialLinkId: true,
            socialUrl: true,
            status: true,
            reviewedByAdminUserId: true,
            reviewNote: true,
          },
        }),
        prisma.moderationViolationEvent.count({
          where: { profileId, eventType: "revoked" },
        }),
      ],
    );
    expect(midCases.find((item) => item.id === linkCaseAId)).toEqual({
      id: linkCaseAId,
      status: "confirmed",
    });
    expect(midCases.find((item) => item.id === profileCaseId)).toEqual({
      id: profileCaseId,
      status: "preReviewPending",
    });
    expect(midCases.find((item) => item.id === linkCaseBId)).toEqual({
      id: linkCaseBId,
      status: "preReviewPending",
    });
    expect(midLinks.find((item) => item.id === linkAId)?.status).toBe("active");
    expect(midLinks.find((item) => item.id === linkBId)?.status).toBe("hidden");
    expect(
      midRequests.find((item) => item.id === linkARequestId),
    ).toMatchObject({
      moderationCaseId: linkCaseAId,
      socialLinkId: evidenceLinkId,
      socialUrl: expect.stringContaining("instagram.com/e-"),
      status: "verified",
      reviewedByAdminUserId: adminId,
      reviewNote: "申請内容と投稿を確認しました。",
    });
    expect(
      midRequests.find((item) => item.id === profileRequestId)?.status,
    ).toBe("pending");
    expect(midRequests.find((item) => item.id === linkBRequestId)?.status).toBe(
      "pending",
    );
    expect(midRevocations).toBe(1);
    const linkBResponse = await approve(linkBRequestId);
    expect(linkBResponse.status).toBe(200);
    expect((await approve(profileRequestId)).status).toBe(200);

    const [cases, links, requests, violations] = await Promise.all([
      prisma.moderationCase.findMany({
        where: { id: { in: [profileCaseId, linkCaseAId, linkCaseBId] } },
        select: { id: true, status: true, targetType: true, targetId: true },
      }),
      prisma.socialLink.findMany({
        where: { id: { in: [linkAId, linkBId, evidenceLinkId] } },
        select: { id: true, status: true },
      }),
      prisma.identityVerificationRequest.findMany({
        where: { id: { in: requestIds } },
        select: {
          id: true,
          moderationCaseId: true,
          socialLinkId: true,
          socialUrl: true,
          status: true,
        },
      }),
      prisma.moderationViolationEvent.findMany({
        where: { profileId, eventType: "revoked" },
        select: { moderationCaseId: true, originalViolationEventId: true },
      }),
    ]);
    expect(cases).toHaveLength(3);
    expect(cases.every((item) => item.status === "confirmed")).toBe(true);
    expect(cases.find((item) => item.id === linkCaseAId)).toMatchObject({
      targetType: "socialLink",
      targetId: linkAId,
    });
    expect(cases.find((item) => item.id === linkCaseBId)).toMatchObject({
      targetType: "socialLink",
      targetId: linkBId,
    });
    expect(links.find((link) => link.id === linkAId)?.status).toBe("active");
    expect(links.find((link) => link.id === linkBId)?.status).toBe("active");
    expect(
      requests.find((request) => request.id === linkARequestId),
    ).toMatchObject({
      moderationCaseId: linkCaseAId,
      socialLinkId: evidenceLinkId,
      status: "verified",
    });
    expect(
      requests.find((request) => request.id === linkBRequestId),
    ).toMatchObject({
      moderationCaseId: linkCaseBId,
      socialLinkId: linkAId,
      status: "verified",
    });
    expect(violations.map((event) => event.moderationCaseId).sort()).toEqual(
      [profileCaseId, linkCaseAId, linkCaseBId].sort(),
    );
  });
});
