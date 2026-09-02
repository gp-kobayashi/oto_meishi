import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  adminRate: vi.fn(),
  ipRate: vi.fn(),
  getClientIp: vi.fn(),
}));
vi.mock("@/lib/adminAuth", () => ({ authorizeAdminRequest: mocks.authorize }));
vi.mock("@/lib/adminActionRateLimit", () => ({
  consumeAdminActionRateLimit: mocks.adminRate,
  consumeAdminActionIpRateLimit: mocks.ipRate,
}));
vi.mock("@/lib/clientIp", () => ({ getClientIp: mocks.getClientIp }));

import { PATCH } from "@/app/(site)/api/admin/moderation/cases/[caseId]/route";
import { prisma } from "@/lib/prisma";

describe("ケース審査の修正版スナップショット統合テスト", () => {
  const runId = crypto.randomUUID();
  const profileIds: string[] = [];
  let adminUserId = "";
  const cases: Record<string, string> = {};

  beforeAll(async () => {
    const admin = await prisma.adminUser.create({
      data: { authId: `corrected-snapshot-admin-${runId}`, role: "admin" },
      select: { id: true },
    });
    adminUserId = admin.id;
    mocks.authorize.mockResolvedValue({
      ok: true,
      admin: {
        id: adminUserId,
        authId: `corrected-snapshot-admin-${runId}`,
        role: "admin",
      },
    });
    mocks.adminRate.mockReturnValue({ allowed: true });
    mocks.ipRate.mockReturnValue({ allowed: true });
    mocks.getClientIp.mockReturnValue(null);

    const createFixture = async (
      name: string,
      targetType: "profile" | "audio" | "socialLink",
      deleted = false,
    ) => {
      const profile = await prisma.profile.create({
        data: {
          userId: `corrected-snapshot-${name}-${runId}`,
          displayName: "表示名",
          bio: "自己紹介",
          theme: "normal",
          audioUrl: deleted ? "" : "",
          audioKey: deleted ? "" : "audio/current.m4a",
          audioTitle: deleted ? "" : "音声",
          audioStatus: deleted ? "removed" : "hidden",
          status: deleted ? "active" : "hidden",
        },
        select: { id: true },
      });
      profileIds.push(profile.id);
      const link =
        targetType === "socialLink"
          ? await prisma.socialLink.create({
              data: {
                profileId: profile.id,
                service: "youtube",
                label: "YouTube",
                url: "https://youtube.com/current",
                sortOrder: 0,
                status: "hidden",
              },
              select: { id: true },
            })
          : null;
      const targetId = targetType === "socialLink" ? link!.id : profile.id;
      const content =
        targetType === "profile"
          ? { displayName: "表示名", bio: "自己紹介", theme: "normal" }
          : targetType === "audio"
            ? deleted
              ? { deleted: true }
              : { audioKey: "audio/current.m4a" }
            : deleted
              ? { deleted: true }
              : {
                  service: "youtube",
                  label: "YouTube",
                  url: "https://youtube.com/current",
                };
      const moderationCase = await prisma.moderationCase.create({
        data: {
          profileId: profile.id,
          targetType,
          targetId,
          reasonCode: "other",
          reviewMode: deleted ? "postReview" : "preReview",
          status: deleted ? "postReviewPending" : "preReviewPending",
          userMessage: "確認してください",
        },
        select: { id: true },
      });
      cases[name] = moderationCase.id;
      await prisma.moderationSnapshot.createMany({
        data: [
          {
            moderationCaseId: moderationCase.id,
            kind: "reported",
            content: { reported: true },
            expiresAt: new Date("2999-01-01"),
          },
          {
            moderationCaseId: moderationCase.id,
            kind: "corrected",
            content,
            contentHash:
              targetType === "audio" && !deleted ? "a".repeat(64) : null,
            expiresAt: new Date("2999-01-01"),
          },
        ],
      });
    };
    await createFixture("profile", "profile");
    await createFixture("audio", "audio");
    await createFixture("link", "socialLink");
    await createFixture("deleted", "audio", true);
  });

  afterAll(async () => {
    try {
      await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`select set_config('app.account_deletion', 'enabled', true)`;
        await tx.moderationAction.deleteMany({
          where: { profileId: { in: profileIds } },
        });
        await tx.profile.deleteMany({ where: { id: { in: profileIds } } });
        await tx.adminUser.deleteMany({ where: { id: adminUserId } });
      });
    } finally {
      await prisma.$disconnect();
    }
  }, 15_000);

  const review = (caseId: string, body: Record<string, unknown>) =>
    PATCH(
      new Request(`http://localhost/api/admin/moderation/cases/${caseId}`, {
        method: "PATCH",
        headers: {
          Authorization: "Bearer integration-admin-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      }),
      { params: Promise.resolve({ caseId }) },
    );

  it("profile/audio/link/deletedのcorrectedを承認できる", async () => {
    for (const name of ["profile", "audio", "link", "deleted"]) {
      const snapshot = await prisma.moderationSnapshot.findFirstOrThrow({
        where: { moderationCaseId: cases[name], kind: "corrected" },
        select: { id: true },
      });
      const response = await review(cases[name], {
        decision: "approve",
        reason: "修正を確認しました",
        reviewedSnapshotId: snapshot.id,
      });
      expect(response.status).toBe(200);
    }
  });

  it("reported指定やcorrectedなしは承認できない", async () => {
    const response = await review(cases.profile, {
      decision: "approve",
      reason: "確認",
      reviewedSnapshotId: "missing",
    });
    expect(response.status).toBe(409);
  });
});
