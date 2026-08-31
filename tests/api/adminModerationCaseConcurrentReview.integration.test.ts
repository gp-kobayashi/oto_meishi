import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authorizeAdminRequest: vi.fn(),
  consumeAdminActionRateLimit: vi.fn(),
  consumeAdminActionIpRateLimit: vi.fn(),
}));

vi.mock("@/lib/adminAuth", () => ({
  authorizeAdminRequest: mocks.authorizeAdminRequest,
}));
vi.mock("@/lib/adminActionRateLimit", () => ({
  consumeAdminActionRateLimit: mocks.consumeAdminActionRateLimit,
  consumeAdminActionIpRateLimit: mocks.consumeAdminActionIpRateLimit,
}));
vi.mock("@/lib/clientIp", () => ({ getClientIp: () => null }));

import { PATCH } from "@/app/(site)/api/admin/moderation/cases/[caseId]/route";
import { lockModerationProfile } from "@/lib/moderationTransactionLock";
import { prisma } from "@/lib/prisma";

type Scenario = {
  profileId: string;
  caseId: string;
  snapshotId: string;
};

describe("同一モデレーションケースの並行審査", () => {
  const testRunId = crypto.randomUUID();
  const adminAuthIds = [
    `double-review-admin-a-${testRunId}`,
    `double-review-admin-b-${testRunId}`,
  ];
  let adminIds: string[] = [];
  const scenarios: Scenario[] = [];

  beforeAll(async () => {
    const admins = await Promise.all(
      adminAuthIds.map((authId) =>
        prisma.adminUser.create({
          data: { authId, role: "admin" },
          select: { id: true },
        }),
      ),
    );
    adminIds = admins.map((admin) => admin.id);
    for (const label of ["approve-approve", "approve-request-changes"]) {
      const profile = await prisma.profile.create({
        data: {
          userId: `double-review-${label}-${testRunId}`,
          authId: `double-review-auth-${label}-${testRunId}`,
          displayName: `二重審査テスト ${label}`,
          bio: "統合テスト用プロフィール",
          theme: "normal",
          audioUrl: "",
          audioKey: `audio/double-review-${label}.m4a`,
          audioContentHash: "a".repeat(64),
          audioTitle: "統合テスト音声",
          audioStatus: "hidden",
        },
        select: { id: true, audioKey: true },
      });
      const moderationCase = await prisma.moderationCase.create({
        data: {
          profileId: profile.id,
          targetType: "audio",
          targetId: profile.id,
          reasonCode: "inappropriateContent",
          reviewMode: "preReview",
          status: "preReviewPending",
          userMessage: "音声を確認してください。",
        },
        select: { id: true },
      });
      const snapshot = await prisma.moderationSnapshot.create({
        data: {
          moderationCaseId: moderationCase.id,
          kind: "corrected",
          content: { audioKey: profile.audioKey },
          contentHash: "a".repeat(64),
          expiresAt: new Date(Date.now() + 60 * 86_400_000),
        },
        select: { id: true },
      });
      scenarios.push({
        profileId: profile.id,
        caseId: moderationCase.id,
        snapshotId: snapshot.id,
      });
    }
  });

  afterAll(async () => {
    try {
      await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`select set_config('app.account_deletion', 'enabled', true)`;
        await tx.moderationAction.deleteMany({
          where: {
            profileId: { in: scenarios.map(({ profileId }) => profileId) },
          },
        });
        await tx.profile.deleteMany({
          where: { id: { in: scenarios.map(({ profileId }) => profileId) } },
        });
        await tx.adminUser.deleteMany({ where: { id: { in: adminIds } } });
      });
    } finally {
      await prisma.$disconnect();
    }
  }, 15_000);

  beforeAll(() => {
    mocks.authorizeAdminRequest.mockImplementation(async (request: Request) => {
      const token = request.headers.get("Authorization");
      const index = token?.endsWith("-a") ? 0 : 1;
      return {
        ok: true,
        admin: {
          id: adminIds[index],
          authId: adminAuthIds[index],
          role: "admin",
        },
      };
    });
    mocks.consumeAdminActionRateLimit.mockReturnValue({ allowed: true });
    mocks.consumeAdminActionIpRateLimit.mockReturnValue({ allowed: true });
  });

  async function runConcurrentReviews(
    scenario: Scenario,
    secondDecision: "approve" | "requestChanges",
  ) {
    const baseline = await prisma.$queryRaw<{ count: bigint }[]>`
      select count(*)::bigint as count
      from pg_locks
      where locktype = 'advisory' and not granted
    `;
    const baselineWaiters = Number(baseline[0]?.count ?? BigInt(0));
    let releaseHolder!: () => void;
    let resolveHolderReady!: () => void;
    const holderReady = new Promise<void>((resolve) => {
      resolveHolderReady = resolve;
    });
    const releasePromise = new Promise<void>((resolve) => {
      releaseHolder = resolve;
    });
    const holder = prisma.$transaction(async (tx) => {
      await lockModerationProfile(tx, scenario.profileId);
      resolveHolderReady();
      await releasePromise;
    });
    const waitForWaiters = async (expected: number) => {
      const deadline = Date.now() + 2_000;
      while (Date.now() < deadline) {
        const rows = await prisma.$queryRaw<{ count: bigint }[]>`
          select count(*)::bigint as count
          from pg_locks
          where locktype = 'advisory' and not granted
        `;
        if (Number(rows[0]?.count ?? BigInt(0)) >= expected) return;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      throw new Error(
        `Timed out waiting for ${expected} advisory lock waiters`,
      );
    };
    const review = (token: string, decision: "approve" | "requestChanges") =>
      PATCH(
        new Request(
          `http://localhost/api/admin/moderation/cases/${scenario.caseId}`,
          {
            method: "PATCH",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              decision,
              reason:
                decision === "approve"
                  ? "修正を確認しました。"
                  : "追加修正が必要です。",
              reviewedSnapshotId: scenario.snapshotId,
            }),
          },
        ),
        { params: Promise.resolve({ caseId: scenario.caseId }) },
      );

    let first: Promise<Response> | undefined;
    let second: Promise<Response> | undefined;
    try {
      await holderReady;
      first = review("double-review-a", "approve");
      await waitForWaiters(baselineWaiters + 1);
      second = review("double-review-b", secondDecision);
      await waitForWaiters(baselineWaiters + 2);
      releaseHolder();
      return await Promise.all([first, second]);
    } finally {
      releaseHolder();
      await holder;
      if (first) await first.catch(() => undefined);
      if (second) await second.catch(() => undefined);
    }
  }

  it("approve同士では先行した1件だけが成功する", async () => {
    const [first, second] = await runConcurrentReviews(scenarios[0], "approve");
    expect(first.status).toBe(200);
    expect(second.status).toBe(409);
    const [moderationCase, profile, approvedEvents, actions, notifications] =
      await Promise.all([
        prisma.moderationCase.findUnique({
          where: { id: scenarios[0].caseId },
          select: { status: true },
        }),
        prisma.profile.findUnique({
          where: { id: scenarios[0].profileId },
          select: { audioStatus: true },
        }),
        prisma.moderationCaseEvent.count({
          where: {
            moderationCaseId: scenarios[0].caseId,
            eventType: "reviewApproved",
          },
        }),
        prisma.moderationAction.count({
          where: { profileId: scenarios[0].profileId },
        }),
        prisma.userNotification.count({
          where: { profileId: scenarios[0].profileId },
        }),
      ]);
    expect(moderationCase).toEqual({ status: "confirmed" });
    expect(profile).toEqual({ audioStatus: "active" });
    expect(approvedEvents).toBe(1);
    expect(actions).toBe(1);
    expect(notifications).toBe(1);
    await expect(second.json()).resolves.toEqual({
      error: "この対象は現在、審査待ちではありません。",
    });
  });

  it("approveとrequestChangesでは先行したapproveだけが成功する", async () => {
    const [first, second] = await runConcurrentReviews(
      scenarios[1],
      "requestChanges",
    );
    expect(first.status).toBe(200);
    expect(second.status).toBe(409);
    const [
      moderationCase,
      approvedEvents,
      rejectedEvents,
      actions,
      notifications,
    ] = await Promise.all([
      prisma.moderationCase.findUnique({
        where: { id: scenarios[1].caseId },
        select: { status: true },
      }),
      prisma.moderationCaseEvent.count({
        where: {
          moderationCaseId: scenarios[1].caseId,
          eventType: "reviewApproved",
        },
      }),
      prisma.moderationCaseEvent.count({
        where: {
          moderationCaseId: scenarios[1].caseId,
          eventType: "reviewRejected",
        },
      }),
      prisma.moderationAction.count({
        where: { profileId: scenarios[1].profileId },
      }),
      prisma.userNotification.count({
        where: { profileId: scenarios[1].profileId },
      }),
    ]);
    expect(moderationCase).toEqual({ status: "confirmed" });
    expect(approvedEvents).toBe(1);
    expect(rejectedEvents).toBe(0);
    expect(actions).toBe(1);
    expect(notifications).toBe(1);
    await expect(second.json()).resolves.toEqual({
      error: "この対象は現在、審査待ちではありません。",
    });
  });
});
