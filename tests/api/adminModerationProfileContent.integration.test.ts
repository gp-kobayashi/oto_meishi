import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  adminRate: vi.fn(),
  ipRate: vi.fn(),
}));

vi.mock("@/lib/adminAuth", () => ({ authorizeAdminRequest: mocks.authorize }));
vi.mock("@/lib/adminActionRateLimit", () => ({
  consumeAdminActionRateLimit: mocks.adminRate,
  consumeAdminActionIpRateLimit: mocks.ipRate,
}));
vi.mock("@/lib/clientIp", () => ({ getClientIp: () => null }));

import { PATCH } from "@/app/(site)/api/admin/moderation/cases/[caseId]/route";
import type { SocialService } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";

type LinkInput = {
  id: string;
  service: SocialService;
  label: string;
  url: string;
  sortOrder: number;
};

describe("プロフィール全体ケースの内容競合", () => {
  const runId = crypto.randomUUID();
  let adminUserId = "";
  const profileIds: string[] = [];
  const fixtures: Array<{
    name: string;
    caseId: string;
    snapshotId: string;
  }> = [];

  const baseAudio = {
    key: "audio/profile-content.m4a",
    title: "紹介音声",
    hash: "a".repeat(64),
  };

  async function createFixture(name: string, links: LinkInput[]) {
    const profile = await prisma.profile.create({
      data: {
        userId: `profile-content-${name}-${runId}`,
        displayName: "プロフィール表示名",
        bio: "プロフィール自己紹介",
        theme: "normal",
        status: "hidden",
        audioKey: baseAudio.key,
        audioUrl: "",
        audioTitle: baseAudio.title,
        audioContentHash: baseAudio.hash,
        audioStatus: "active",
        sns: {
          create: links.map((link) => ({
            service: link.service,
            label: link.label,
            url: link.url,
            sortOrder: link.sortOrder,
          })),
        },
      },
      select: {
        id: true,
        sns: {
          select: {
            id: true,
            service: true,
            label: true,
            url: true,
            status: true,
            sortOrder: true,
          },
        },
      },
    });
    profileIds.push(profile.id);

    const snapshotLinks = profile.sns.map((link) => ({
      id: link.id,
      service: link.service,
      label: link.label,
      url: link.url,
      status: link.status,
      sortOrder: link.sortOrder,
    }));
    const moderationCase = await prisma.moderationCase.create({
      data: {
        profileId: profile.id,
        targetType: "profile",
        targetId: profile.id,
        reasonCode: "other",
        reviewMode: "preReview",
        status: "preReviewPending",
        userMessage: "プロフィールを確認してください。",
      },
      select: { id: true },
    });
    const snapshot = await prisma.moderationSnapshot.create({
      data: {
        moderationCaseId: moderationCase.id,
        kind: "corrected",
        content: {
          displayName: "プロフィール表示名",
          bio: "プロフィール自己紹介",
          theme: "normal",
          audio: {
            hasAudio: true,
            contentHash: baseAudio.hash,
            storageKey: baseAudio.key,
            title: baseAudio.title,
            status: "active",
          },
          socialLinks: snapshotLinks,
        },
        expiresAt: new Date("2999-01-01"),
      },
      select: { id: true },
    });
    fixtures.push({ name, caseId: moderationCase.id, snapshotId: snapshot.id });
    return { profileId: profile.id, links: profile.sns };
  }

  beforeAll(async () => {
    const admin = await prisma.adminUser.create({
      data: { authId: `profile-content-admin-${runId}`, role: "admin" },
      select: { id: true },
    });
    adminUserId = admin.id;
    mocks.authorize.mockResolvedValue({
      ok: true,
      admin: { id: adminUserId, role: "admin" },
    });
    mocks.adminRate.mockReturnValue({ allowed: true });
    mocks.ipRate.mockReturnValue({ allowed: true });

    await createFixture("unchanged", []);
    await createFixture("audio", []);
    await createFixture("url", [
      {
        id: "unused",
        service: "youtube",
        label: "動画",
        url: "https://youtube.com/original",
        sortOrder: 0,
      },
    ]);
    await createFixture("label", [
      {
        id: "unused",
        service: "youtube",
        label: "動画",
        url: "https://youtube.com/original",
        sortOrder: 0,
      },
    ]);
    await createFixture("add", [
      {
        id: "unused",
        service: "youtube",
        label: "動画",
        url: "https://youtube.com/original",
        sortOrder: 0,
      },
    ]);
    await createFixture("delete", [
      {
        id: "unused-a",
        service: "youtube",
        label: "動画A",
        url: "https://youtube.com/a",
        sortOrder: 0,
      },
      {
        id: "unused-b",
        service: "x",
        label: "投稿B",
        url: "https://x.com/b",
        sortOrder: 1,
      },
    ]);
    await createFixture("sort", [
      {
        id: "unused-a",
        service: "youtube",
        label: "動画A",
        url: "https://youtube.com/a",
        sortOrder: 0,
      },
      {
        id: "unused-b",
        service: "x",
        label: "投稿B",
        url: "https://x.com/b",
        sortOrder: 1,
      },
    ]);
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

  const review = (caseId: string, snapshotId: string) =>
    PATCH(
      new Request(`http://localhost/api/admin/moderation/cases/${caseId}`, {
        method: "PATCH",
        headers: {
          Authorization: "Bearer integration-admin-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          decision: "approve",
          reason: "修正内容を確認しました。",
          reviewedSnapshotId: snapshotId,
        }),
      }),
      { params: Promise.resolve({ caseId }) },
    );

  const fixture = (name: string) =>
    fixtures.find((item) => item.name === name)!;

  it("変更がないプロフィールは承認できる", async () => {
    const response = await review(
      fixture("unchanged").caseId,
      fixture("unchanged").snapshotId,
    );
    expect(response.status).toBe(200);
  });

  it.each(["audio", "url", "label", "add", "delete", "sort"])(
    "%sの変更は古いプロフィールスナップショットとして拒否する",
    async (name) => {
      const current = fixture(name);
      const profileId = profileIds[fixtures.indexOf(current)];
      const profile = await prisma.profile.findUniqueOrThrow({
        where: { id: profileId },
        select: { sns: { select: { id: true, sortOrder: true } } },
      });
      if (name === "audio") {
        await prisma.profile.update({
          where: { id: profileId },
          data: { audioContentHash: "b".repeat(64) },
        });
      } else if (name === "url" || name === "label") {
        await prisma.socialLink.update({
          where: { id: profile.sns[0].id },
          data:
            name === "url"
              ? { url: "https://youtube.com/changed" }
              : { label: "変更後" },
        });
      } else if (name === "add") {
        await prisma.socialLink.create({
          data: {
            profileId,
            service: "x",
            label: "追加投稿",
            url: "https://x.com/added",
            sortOrder: 1,
          },
        });
      } else if (name === "delete") {
        await prisma.socialLink.delete({ where: { id: profile.sns[1].id } });
      } else {
        await prisma.socialLink.update({
          where: { id: profile.sns[0].id },
          data: { sortOrder: 1 },
        });
        await prisma.socialLink.update({
          where: { id: profile.sns[1].id },
          data: { sortOrder: 0 },
        });
      }

      const response = await review(current.caseId, current.snapshotId);
      expect(response.status).toBe(409);
      const moderationCase = await prisma.moderationCase.findUniqueOrThrow({
        where: { id: current.caseId },
        select: { status: true },
      });
      expect(moderationCase.status).toBe("preReviewPending");
    },
  );
});
