import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  deleteMany: vi.fn(),
  update: vi.fn(),
  deleteFromR2: vi.fn(),
  getReferenceState: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    pendingR2ObjectDeletion: {
      findMany: mocks.findMany,
      deleteMany: mocks.deleteMany,
      update: mocks.update,
    },
  },
}));
vi.mock("@/lib/r2Storage", () => ({ deleteFromR2: mocks.deleteFromR2 }));
vi.mock("@/lib/moderationAudioEvidence", () => ({
  getAudioObjectReferenceState: mocks.getReferenceState,
  canDeleteAudioObject: (state: {
    referencedByCurrentProfile: boolean;
    referencedByUnexpiredSnapshot: boolean;
    referencedByUnresolvedCase: boolean;
  }) =>
    !state.referencedByCurrentProfile &&
    !state.referencedByUnexpiredSnapshot &&
    !state.referencedByUnresolvedCase,
}));

import { retryPendingR2ObjectDeletions } from "@/lib/pendingR2ObjectDeletion";

const NOW = new Date("2026-08-13T07:00:00.000Z");
const UNREFERENCED = {
  referencedByCurrentProfile: false,
  referencedByUnexpiredSnapshot: false,
  referencedByUnresolvedCase: false,
};

describe("R2オブジェクト削除の再試行", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findMany.mockResolvedValue([{ objectKey: "audio/user/old.m4a" }]);
    mocks.getReferenceState.mockResolvedValue(UNREFERENCED);
    mocks.deleteFromR2.mockResolvedValue(undefined);
    mocks.deleteMany.mockResolvedValue({ count: 1 });
    mocks.update.mockResolvedValue({ id: "pending-1" });
  });

  it("未参照のオブジェクトを削除して待機レコードを解消する", async () => {
    await expect(retryPendingR2ObjectDeletions(NOW, 25)).resolves.toEqual({
      examined: 1,
      deleted: 1,
      failed: 0,
      skipped: 0,
    });
    expect(mocks.findMany).toHaveBeenCalledWith({
      take: 25,
      orderBy: { updatedAt: "asc" },
    });
    expect(mocks.deleteFromR2).toHaveBeenCalledWith("audio/user/old.m4a");
    expect(mocks.deleteMany).toHaveBeenCalledWith({
      where: { objectKey: "audio/user/old.m4a" },
    });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("R2削除失敗を次回の再試行用に記録する", async () => {
    mocks.deleteFromR2.mockRejectedValueOnce(new Error("R2 unavailable"));

    await expect(retryPendingR2ObjectDeletions(NOW)).resolves.toEqual({
      examined: 1,
      deleted: 0,
      failed: 1,
      skipped: 0,
    });
    expect(mocks.update).toHaveBeenCalledWith({
      where: { objectKey: "audio/user/old.m4a" },
      data: {
        attemptCount: { increment: 1 },
        lastAttemptAt: NOW,
        lastError: "R2 unavailable",
      },
    });
    expect(mocks.deleteMany).not.toHaveBeenCalled();
  });

  it("参照確認失敗も記録して他の処理を止めない", async () => {
    mocks.getReferenceState.mockRejectedValueOnce(new Error("DB unavailable"));

    await expect(retryPendingR2ObjectDeletions(NOW)).resolves.toEqual({
      examined: 1,
      deleted: 0,
      failed: 1,
      skipped: 0,
    });
    expect(mocks.update).toHaveBeenCalledWith({
      where: { objectKey: "audio/user/old.m4a" },
      data: {
        attemptCount: { increment: 1 },
        lastAttemptAt: NOW,
        lastError: "DB unavailable",
      },
    });
    expect(mocks.deleteFromR2).not.toHaveBeenCalled();
  });

  it("再参照されたオブジェクトは待機状態のまま削除しない", async () => {
    mocks.getReferenceState.mockResolvedValueOnce({
      ...UNREFERENCED,
      referencedByCurrentProfile: true,
    });

    await expect(retryPendingR2ObjectDeletions(NOW)).resolves.toEqual({
      examined: 1,
      deleted: 0,
      failed: 0,
      skipped: 1,
    });
    expect(mocks.deleteFromR2).not.toHaveBeenCalled();
    expect(mocks.deleteMany).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
