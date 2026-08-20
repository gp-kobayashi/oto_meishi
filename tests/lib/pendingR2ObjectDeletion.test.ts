import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  findUnique: vi.fn(),
  upsert: vi.fn(),
  deleteMany: vi.fn(),
  update: vi.fn(),
  deleteFromR2: vi.fn(),
  getReferenceState: vi.fn(),
  lifecycleUpdateMany: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    pendingR2ObjectDeletion: mocks,
    moderationSnapshotEvidenceLifecycle: {
      updateMany: mocks.lifecycleUpdateMany,
    },
  },
}));
vi.mock("@/lib/r2Storage", () => ({ deleteFromR2: mocks.deleteFromR2 }));
vi.mock("@/lib/moderationAudioEvidence", () => ({
  getAudioObjectReferenceState: mocks.getReferenceState,
  canDeleteAudioObject: (s: ReferenceState) =>
    !s.referencedByCurrentProfile &&
    !s.referencedByUnexpiredSnapshot &&
    !s.referencedByUnresolvedCase,
}));
type ReferenceState = {
  referencedByCurrentProfile: boolean;
  referencedByUnexpiredSnapshot: boolean;
  referencedByUnresolvedCase: boolean;
};
import {
  processPendingR2ObjectDeletion,
  requestR2ObjectDeletion,
  retryPendingR2ObjectDeletions,
} from "@/lib/pendingR2ObjectDeletion";
const NOW = new Date("2026-08-13T07:00:00.000Z");
const FREE = {
  referencedByCurrentProfile: false,
  referencedByUnexpiredSnapshot: false,
  referencedByUnresolvedCase: false,
};
describe("R2削除待機キュー", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findMany.mockResolvedValue([]);
    mocks.findUnique.mockResolvedValue({ objectKey: "k", attemptCount: 0 });
    mocks.upsert.mockResolvedValue({});
    mocks.deleteMany.mockResolvedValue({ count: 1 });
    mocks.update.mockResolvedValue({});
    mocks.deleteFromR2.mockResolvedValue(undefined);
    mocks.getReferenceState.mockResolvedValue(FREE);
  });
  it("キュー登録を削除より先に実行する", async () => {
    await requestR2ObjectDeletion("k", NOW);
    expect(mocks.upsert).toHaveBeenCalled();
    expect(mocks.deleteFromR2).toHaveBeenCalledWith("k");
    expect(mocks.upsert.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.deleteFromR2.mock.invocationCallOrder[0],
    );
    expect(mocks.deleteMany).toHaveBeenCalledWith({
      where: { objectKey: "k" },
    });
  });
  it("キュー登録失敗時はR2削除を実行しない", async () => {
    mocks.upsert.mockRejectedValue(new Error("db"));
    await expect(requestR2ObjectDeletion("k", NOW)).resolves.toBe("failed");
    expect(mocks.deleteFromR2).not.toHaveBeenCalled();
  });
  it("参照中のオブジェクトは24時間後へ延期する", async () => {
    mocks.getReferenceState.mockResolvedValue({
      ...FREE,
      referencedByCurrentProfile: true,
    });
    await expect(processPendingR2ObjectDeletion("k", NOW)).resolves.toBe(
      "skipped",
    );
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { nextAttemptAt: new Date("2026-08-14T07:00:00.000Z") },
      }),
    );
  });
  it("削除失敗は1時間後へ再試行する", async () => {
    mocks.deleteFromR2.mockRejectedValue(new Error("r2"));
    await processPendingR2ObjectDeletion("k", NOW);
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          nextAttemptAt: new Date("2026-08-13T08:00:00.000Z"),
        }),
      }),
    );
  });
  it("findUnique失敗は1時間後の再試行を記録する", async () => {
    mocks.findUnique.mockRejectedValueOnce(new Error("db unavailable"));
    await expect(processPendingR2ObjectDeletion("k", NOW)).resolves.toBe(
      "failed",
    );
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          nextAttemptAt: new Date("2026-08-13T08:00:00.000Z"),
        }),
      }),
    );
  });
  it("試行回数が多い場合も再試行間隔を24時間に制限する", async () => {
    mocks.findUnique.mockResolvedValueOnce({ objectKey: "k", attemptCount: 5 });
    mocks.deleteFromR2.mockRejectedValueOnce(new Error("r2"));
    await processPendingR2ObjectDeletion("k", NOW);
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          nextAttemptAt: new Date("2026-08-14T07:00:00.000Z"),
        }),
      }),
    );
  });
  it("期限到来分を指定順序で選択する", async () => {
    await retryPendingR2ObjectDeletions(NOW, 25);
    expect(mocks.findMany).toHaveBeenCalledWith({
      where: { nextAttemptAt: { lte: NOW } },
      take: 25,
      orderBy: [{ nextAttemptAt: "asc" }, { updatedAt: "asc" }],
    });
  });
  it("再試行成功後に期限切れの音声証拠を削除済みとして記録する", async () => {
    mocks.findMany.mockResolvedValueOnce([{ objectKey: "audio/evidence.m4a" }]);

    await expect(retryPendingR2ObjectDeletions(NOW, 25)).resolves.toEqual({
      examined: 1,
      deleted: 1,
      failed: 0,
      skipped: 0,
    });
    expect(mocks.lifecycleUpdateMany).toHaveBeenCalledWith({
      where: {
        deletedAt: null,
        retainUntil: { lte: NOW },
        snapshot: {
          storageObjectKey: "audio/evidence.m4a",
          moderationCase: { status: "confirmed" },
        },
      },
      data: { deletedAt: NOW },
    });
  });
});
