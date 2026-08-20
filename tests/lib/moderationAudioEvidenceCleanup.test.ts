import { beforeEach, describe, expect, it, vi } from "vitest";

const { mocks } = vi.hoisted(() => ({
  mocks: {
    findMany: vi.fn(),
    updateMany: vi.fn(),
    profileFindFirst: vi.fn(),
    lifecycleFindFirst: vi.fn(),
    lifecycleUpdateMany: vi.fn(),
    requestR2ObjectDeletion: vi.fn(),
    retryPendingR2ObjectDeletions: vi.fn(),
    pendingFindMany: vi.fn(),
    pendingDeleteMany: vi.fn(),
    pendingUpdate: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    profile: { findFirst: mocks.profileFindFirst },
    moderationSnapshotEvidenceLifecycle: {
      findMany: mocks.findMany,
      findFirst: mocks.lifecycleFindFirst,
      updateMany: mocks.lifecycleUpdateMany,
    },
    pendingR2ObjectDeletion: {
      findMany: mocks.pendingFindMany,
      deleteMany: mocks.pendingDeleteMany,
      update: mocks.pendingUpdate,
    },
  },
}));
vi.mock("@/lib/pendingR2ObjectDeletion", () => ({
  requestR2ObjectDeletion: mocks.requestR2ObjectDeletion,
  retryPendingR2ObjectDeletions: mocks.retryPendingR2ObjectDeletions,
}));

import { cleanupExpiredModerationAudioEvidence } from "@/lib/moderationAudioEvidenceCleanup";

describe("期限切れモデレーション音声の削除", () => {
  const now = new Date("2026-08-03T00:00:00.000Z");

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findMany.mockResolvedValue([
      { snapshot: { storageObjectKey: "audio/user/expired.m4a" } },
    ]);
    mocks.profileFindFirst.mockResolvedValue(null);
    mocks.lifecycleFindFirst.mockResolvedValue(null);
    mocks.lifecycleUpdateMany.mockResolvedValue({ count: 2 });
    mocks.requestR2ObjectDeletion.mockResolvedValue("deleted");
    mocks.retryPendingR2ObjectDeletions.mockResolvedValue({
      examined: 0,
      deleted: 0,
      failed: 0,
      skipped: 0,
    });
    mocks.pendingFindMany.mockResolvedValue([]);
  });

  it("参照されていない期限切れ音声を削除してDB参照を外す", async () => {
    await expect(cleanupExpiredModerationAudioEvidence(now)).resolves.toEqual({
      examined: 1,
      deletedObjects: 1,
      releasedReferences: 2,
      failed: 0,
      pending: { examined: 0, deleted: 0, failed: 0, skipped: 0 },
    });
    expect(mocks.requestR2ObjectDeletion).toHaveBeenCalledWith(
      "audio/user/expired.m4a",
      now,
    );
    expect(mocks.lifecycleUpdateMany).toHaveBeenCalledWith({
      where: {
        deletedAt: null,
        retainUntil: { lte: now },
        snapshot: {
          storageObjectKey: "audio/user/expired.m4a",
          moderationCase: { status: "confirmed" },
        },
      },
      data: { deletedAt: now },
    });
  });

  it("現在のプロフィールから参照中ならR2を残して期限切れ参照だけ外す", async () => {
    mocks.profileFindFirst.mockResolvedValueOnce({ id: "profile-1" });

    await expect(cleanupExpiredModerationAudioEvidence(now)).resolves.toEqual({
      examined: 1,
      deletedObjects: 0,
      releasedReferences: 0,
      failed: 0,
      pending: { examined: 0, deleted: 0, failed: 0, skipped: 0 },
    });
    expect(mocks.requestR2ObjectDeletion).not.toHaveBeenCalled();
    expect(mocks.lifecycleUpdateMany).not.toHaveBeenCalled();
  });

  it("R2削除に失敗した場合はDB参照を残して次回再試行できる", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.requestR2ObjectDeletion.mockResolvedValueOnce("failed");

    await expect(cleanupExpiredModerationAudioEvidence(now)).resolves.toEqual({
      examined: 1,
      deletedObjects: 0,
      releasedReferences: 0,
      failed: 1,
      pending: { examined: 0, deleted: 0, failed: 0, skipped: 0 },
    });
    expect(mocks.lifecycleUpdateMany).not.toHaveBeenCalled();
  });

  it("未完了ケースが同じ音声を参照中ならR2を削除しない", async () => {
    mocks.lifecycleFindFirst.mockResolvedValueOnce(null);
    mocks.lifecycleFindFirst.mockResolvedValueOnce({ id: "lifecycle-open" });

    await expect(cleanupExpiredModerationAudioEvidence(now)).resolves.toEqual({
      examined: 1,
      deletedObjects: 0,
      releasedReferences: 0,
      failed: 0,
      pending: { examined: 0, deleted: 0, failed: 0, skipped: 0 },
    });
    expect(mocks.requestR2ObjectDeletion).not.toHaveBeenCalled();
  });
});
