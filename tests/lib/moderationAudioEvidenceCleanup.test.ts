import { beforeEach, describe, expect, it, vi } from "vitest";

const { mocks } = vi.hoisted(() => ({
  mocks: {
    findMany: vi.fn(),
    updateMany: vi.fn(),
    profileFindFirst: vi.fn(),
    snapshotFindFirst: vi.fn(),
    deleteFromR2: vi.fn(),
    pendingFindMany: vi.fn(),
    pendingDeleteMany: vi.fn(),
    pendingUpdate: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    profile: { findFirst: mocks.profileFindFirst },
    moderationSnapshot: {
      findMany: mocks.findMany,
      findFirst: mocks.snapshotFindFirst,
      updateMany: mocks.updateMany,
    },
    pendingR2ObjectDeletion: {
      findMany: mocks.pendingFindMany,
      deleteMany: mocks.pendingDeleteMany,
      update: mocks.pendingUpdate,
    },
  },
}));
vi.mock("@/lib/r2Storage", () => ({
  deleteFromR2: mocks.deleteFromR2,
}));

import { cleanupExpiredModerationAudioEvidence } from "@/lib/moderationAudioEvidenceCleanup";

describe("期限切れモデレーション音声の削除", () => {
  const now = new Date("2026-08-03T00:00:00.000Z");

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findMany.mockResolvedValue([
      { storageObjectKey: "audio/user/expired.m4a" },
    ]);
    mocks.profileFindFirst.mockResolvedValue(null);
    mocks.snapshotFindFirst.mockResolvedValue(null);
    mocks.deleteFromR2.mockResolvedValue(undefined);
    mocks.pendingFindMany.mockResolvedValue([]);
    mocks.updateMany.mockResolvedValue({ count: 2 });
  });

  it("参照されていない期限切れ音声を削除してDB参照を外す", async () => {
    await expect(cleanupExpiredModerationAudioEvidence(now)).resolves.toEqual({
      examined: 1,
      deletedObjects: 1,
      releasedReferences: 2,
      failed: 0,
      pending: { examined: 0, deleted: 0, failed: 0, skipped: 0 },
    });
    expect(mocks.deleteFromR2).toHaveBeenCalledWith("audio/user/expired.m4a");
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: {
        storageObjectKey: "audio/user/expired.m4a",
        expiresAt: { lte: now },
        moderationCase: { status: "confirmed" },
      },
      data: { storageObjectKey: null },
    });
  });

  it("現在のプロフィールから参照中ならR2を残して期限切れ参照だけ外す", async () => {
    mocks.profileFindFirst.mockResolvedValueOnce({ id: "profile-1" });

    await expect(cleanupExpiredModerationAudioEvidence(now)).resolves.toEqual({
      examined: 1,
      deletedObjects: 0,
      releasedReferences: 2,
      failed: 0,
      pending: { examined: 0, deleted: 0, failed: 0, skipped: 0 },
    });
    expect(mocks.deleteFromR2).not.toHaveBeenCalled();
    expect(mocks.updateMany).toHaveBeenCalledTimes(1);
  });

  it("R2削除に失敗した場合はDB参照を残して次回再試行できる", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.deleteFromR2.mockRejectedValueOnce(new Error("R2 unavailable"));

    await expect(cleanupExpiredModerationAudioEvidence(now)).resolves.toEqual({
      examined: 1,
      deletedObjects: 0,
      releasedReferences: 0,
      failed: 1,
      pending: { examined: 0, deleted: 0, failed: 0, skipped: 0 },
    });
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it("未完了ケースが同じ音声を参照中ならR2を削除しない", async () => {
    mocks.snapshotFindFirst.mockResolvedValueOnce(null);
    mocks.snapshotFindFirst.mockResolvedValueOnce({ id: "snapshot-open" });

    await expect(cleanupExpiredModerationAudioEvidence(now)).resolves.toEqual({
      examined: 1,
      deletedObjects: 0,
      releasedReferences: 2,
      failed: 0,
      pending: { examined: 0, deleted: 0, failed: 0, skipped: 0 },
    });
    expect(mocks.deleteFromR2).not.toHaveBeenCalled();
  });
});
