import { beforeEach, describe, expect, it, vi } from "vitest";

const { mocks } = vi.hoisted(() => ({
  mocks: {
    findMany: vi.fn(),
    transaction: vi.fn(),
    updateMany: vi.fn(),
    actionCreate: vi.fn(),
    notificationCreate: vi.fn(),
    eventCreateMany: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    profile: { findMany: mocks.findMany },
    $transaction: mocks.transaction,
  },
}));

import { processModerationDeadlines } from "@/lib/moderationDeadlineProcessor";

const now = new Date("2026-08-08T00:00:00.000Z");
const transactionClient = {
  profile: { updateMany: mocks.updateMany },
  moderationAction: { create: mocks.actionCreate },
  userNotification: { create: mocks.notificationCreate },
  moderationCaseEvent: { createMany: mocks.eventCreateMany },
};

describe("processModerationDeadlines", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation(
      (callback: (tx: typeof transactionClient) => unknown) =>
        callback(transactionClient),
    );
    mocks.updateMany.mockResolvedValue({ count: 1 });
    mocks.actionCreate.mockResolvedValue({ id: "action-1" });
    mocks.notificationCreate.mockResolvedValue({ id: "notification-1" });
    mocks.eventCreateMany.mockResolvedValue({ count: 1 });
  });

  it("修正されないまま期限を過ぎたプロフィールを利用停止する", async () => {
    mocks.findMany.mockResolvedValue([
      {
        id: "profile-1",
        status: "hidden",
        accountModerationStatus: "active",
        suspensionAppealDueAt: null,
        deletionScheduledAt: null,
        moderationCases: [
          {
            id: "case-1",
            status: "correctionRequired",
            reviewDueAt: new Date("2026-08-07T23:59:59.000Z"),
          },
        ],
        moderationRequests: [],
      },
    ]);

    await expect(processModerationDeadlines(now)).resolves.toEqual({
      examined: 1,
      suspended: 1,
      deletionScheduled: 0,
      deletionCandidates: 0,
      skipped: 0,
      failed: 0,
    });
    expect(mocks.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "suspended",
          accountModerationStatus: "suspended",
          suspensionAppealDueAt: new Date("2026-10-07T00:00:00.000Z"),
        }),
      }),
    );
    expect(mocks.actionCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorType: "system",
        action: "suspend",
        previousStatus: "hidden",
      }),
      select: { id: true },
    });
    expect(mocks.eventCreateMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          moderationCaseId: "case-1",
          eventType: "accountSuspended",
          actorType: "system",
        }),
      ],
    });
  });

  it("解除申請も管理者確認待ちもない利用停止を削除予定にする", async () => {
    mocks.findMany.mockResolvedValue([
      {
        id: "profile-2",
        status: "suspended",
        accountModerationStatus: "suspended",
        suspensionAppealDueAt: new Date("2026-08-08T00:00:00.000Z"),
        deletionScheduledAt: null,
        moderationCases: [],
        moderationRequests: [],
      },
    ]);

    const result = await processModerationDeadlines(now);

    expect(result.deletionScheduled).toBe(1);
    expect(mocks.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          accountModerationStatus: "deletionPending",
          deletionScheduledAt: new Date("2026-10-07T00:00:00.000Z"),
        },
      }),
    );
    expect(mocks.actionCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorType: "system",
        action: "scheduleDeletion",
      }),
      select: { id: true },
    });
  });

  it("管理者確認待ちまたは解除申請待ちは変更しない", async () => {
    mocks.findMany.mockResolvedValue([
      {
        id: "profile-3",
        status: "suspended",
        accountModerationStatus: "suspended",
        suspensionAppealDueAt: new Date("2026-08-01T00:00:00.000Z"),
        deletionScheduledAt: null,
        moderationCases: [
          {
            id: "case-3",
            status: "preReviewPending",
            reviewDueAt: new Date("2026-07-01T00:00:00.000Z"),
          },
        ],
        moderationRequests: [],
      },
      {
        id: "profile-4",
        status: "suspended",
        accountModerationStatus: "suspended",
        suspensionAppealDueAt: new Date("2026-08-01T00:00:00.000Z"),
        deletionScheduledAt: null,
        moderationCases: [],
        moderationRequests: [{ id: "request-1" }],
      },
    ]);

    const result = await processModerationDeadlines(now);

    expect(result.skipped).toBe(2);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("削除予定日を過ぎたプロフィールは削除候補として返す", async () => {
    mocks.findMany.mockResolvedValue([
      {
        id: "profile-5",
        status: "suspended",
        accountModerationStatus: "deletionPending",
        suspensionAppealDueAt: null,
        deletionScheduledAt: new Date("2026-08-08T00:00:00.000Z"),
        moderationCases: [],
        moderationRequests: [],
      },
    ]);

    const result = await processModerationDeadlines(now);

    expect(result.deletionCandidates).toBe(1);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
