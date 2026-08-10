import { beforeEach, describe, expect, it, vi } from "vitest";

const { mocks } = vi.hoisted(() => ({
  mocks: {
    profileUpdateMany: vi.fn(),
    profileFindUnique: vi.fn(),
    deletionRecordFindUnique: vi.fn(),
    deletionRecordFindMany: vi.fn(),
    deletionRecordCreate: vi.fn(),
    deletionRecordUpdate: vi.fn(),
    profileCount: vi.fn(),
    snapshotCount: vi.fn(),
    transaction: vi.fn(),
    txProfileFindFirst: vi.fn(),
    txExecuteRaw: vi.fn(),
    txActionDeleteMany: vi.fn(),
    txProfileDelete: vi.fn(),
    getUserById: vi.fn(),
    deleteUser: vi.fn(),
    deleteFromR2: vi.fn(),
    createFingerprints: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    profile: {
      updateMany: mocks.profileUpdateMany,
      findUnique: mocks.profileFindUnique,
      count: mocks.profileCount,
    },
    moderationSnapshot: { count: mocks.snapshotCount },
    accountDeletionRecord: {
      findUnique: mocks.deletionRecordFindUnique,
      findMany: mocks.deletionRecordFindMany,
      create: mocks.deletionRecordCreate,
      update: mocks.deletionRecordUpdate,
    },
    $transaction: mocks.transaction,
  },
}));
vi.mock("@/lib/supabaseClient", () => ({
  createServerSupabaseClient: () => ({
    auth: {
      admin: {
        getUserById: mocks.getUserById,
        deleteUser: mocks.deleteUser,
      },
    },
  }),
}));
vi.mock("@/lib/r2Storage", () => ({ deleteFromR2: mocks.deleteFromR2 }));
vi.mock("@/lib/registrationBanFingerprint", () => ({
  createRegistrationBanFingerprints: mocks.createFingerprints,
}));

import {
  completePendingAccountAuthDeletions,
  deleteModeratedAccount,
} from "@/lib/moderatedAccountDeletion";

const now = new Date("2026-12-06T00:00:00.000Z");
const tx = {
  profile: {
    findFirst: mocks.txProfileFindFirst,
    delete: mocks.txProfileDelete,
  },
  moderationAction: { deleteMany: mocks.txActionDeleteMany },
  $executeRaw: mocks.txExecuteRaw,
};

describe("deleteModeratedAccount", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.profileUpdateMany.mockResolvedValue({ count: 1 });
    mocks.profileFindUnique.mockResolvedValue({
      authId: "11111111-1111-1111-1111-111111111111",
      audioKey: "audio/user/current.m4a",
      moderationCases: [
        {
          reasonCode: "harassment",
          snapshots: [
            { storageObjectKey: "audio/user/old.m4a" },
            { storageObjectKey: "audio/user/current.m4a" },
          ],
        },
      ],
    });
    mocks.deletionRecordFindUnique.mockResolvedValue(null);
    mocks.deletionRecordFindMany.mockResolvedValue([]);
    mocks.getUserById.mockResolvedValue({
      data: {
        user: {
          id: "11111111-1111-1111-1111-111111111111",
          email: "user@example.com",
          identities: [],
        },
      },
      error: null,
    });
    mocks.createFingerprints.mockReturnValue([
      {
        identifierType: "email",
        provider: null,
        fingerprint: "a".repeat(64),
      },
    ]);
    mocks.profileCount.mockResolvedValue(0);
    mocks.snapshotCount.mockResolvedValue(0);
    mocks.deleteFromR2.mockResolvedValue(undefined);
    mocks.deleteUser.mockResolvedValue({ error: null });
    mocks.txProfileFindFirst.mockResolvedValue({ id: "profile-1" });
    mocks.txProfileDelete.mockResolvedValue({ id: "profile-1" });
    mocks.transaction.mockImplementation((callback) => callback(tx));
  });

  it("禁止記録、利用データ、R2、Authの順で完全削除する", async () => {
    await expect(deleteModeratedAccount("profile-1", now)).resolves.toEqual({
      status: "deleted",
    });

    expect(mocks.deletionRecordCreate).toHaveBeenCalledWith({
      data: {
        formerAuthId: "11111111-1111-1111-1111-111111111111",
        reason: expect.stringContaining("harassment"),
        pendingStorageObjectKeys: [
          "audio/user/current.m4a",
          "audio/user/old.m4a",
        ],
        bannedIdentifiers: {
          create: [
            expect.objectContaining({ fingerprint: "a".repeat(64) }),
          ],
        },
      },
    });
    expect(mocks.deleteFromR2).toHaveBeenCalledTimes(2);
    expect(mocks.deleteUser).toHaveBeenCalledWith(
      "11111111-1111-1111-1111-111111111111",
    );
    expect(mocks.txExecuteRaw).toHaveBeenCalledTimes(1);
    expect(mocks.txActionDeleteMany).toHaveBeenCalledWith({
      where: { profileId: "profile-1" },
    });
    expect(mocks.txProfileDelete).toHaveBeenCalledWith({
      where: { id: "profile-1" },
    });
    expect(mocks.txProfileFindFirst).toHaveBeenCalledWith({
      where: {
        id: "profile-1",
        accountModerationStatus: "deletionPending",
        deletionScheduledAt: { lte: now },
        deletionProcessingStartedAt: now,
        moderationCases: {
          none: {
            status: { in: ["postReviewPending", "preReviewPending"] },
          },
        },
        moderationRequests: {
          none: { kind: "accountAppeal", status: "pending" },
        },
      },
      select: { id: true },
    });
    expect(mocks.deletionRecordUpdate).toHaveBeenCalledWith({
      where: { formerAuthId: "11111111-1111-1111-1111-111111111111" },
      data: { deletedAt: now, pendingStorageObjectKeys: [] },
    });
  });

  it("審査中などで削除対象外なら外部サービスへ接続しない", async () => {
    mocks.profileUpdateMany.mockResolvedValue({ count: 0 });

    await expect(deleteModeratedAccount("profile-1", now)).resolves.toEqual({
      status: "skipped",
      reason: "notEligible",
    });
    expect(mocks.getUserById).not.toHaveBeenCalled();
    expect(mocks.profileFindUnique).not.toHaveBeenCalled();
    expect(mocks.deleteFromR2).not.toHaveBeenCalled();
  });

  it("禁止識別子を保存できなければAuthと利用データを削除しない", async () => {
    mocks.createFingerprints.mockReturnValue([]);

    await expect(deleteModeratedAccount("profile-1", now)).rejects.toThrow(
      "No registration ban identifiers could be created.",
    );
    expect(mocks.deleteUser).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("利用データの削除に失敗した場合はR2オブジェクトを削除しない", async () => {
    mocks.txProfileDelete.mockRejectedValue(new Error("database unavailable"));

    await expect(deleteModeratedAccount("profile-1", now)).rejects.toThrow(
      "database unavailable",
    );

    expect(mocks.deleteFromR2).not.toHaveBeenCalled();
    expect(mocks.deleteUser).not.toHaveBeenCalled();
  });

  it("利用データ削除後のR2削除失敗を次回処理で再試行する", async () => {
    mocks.deleteFromR2.mockRejectedValueOnce(new Error("R2 unavailable"));

    await expect(deleteModeratedAccount("profile-1", now)).rejects.toThrow(
      "R2 unavailable",
    );
    expect(mocks.txProfileDelete).toHaveBeenCalled();
    expect(mocks.deleteUser).not.toHaveBeenCalled();

    mocks.deletionRecordFindMany.mockResolvedValue([
      {
        formerAuthId: "11111111-1111-1111-1111-111111111111",
        pendingStorageObjectKeys: [
          "audio/user/current.m4a",
          "audio/user/old.m4a",
        ],
      },
    ]);

    await expect(completePendingAccountAuthDeletions(now)).resolves.toEqual({
      examined: 1,
      completed: 1,
      skipped: 0,
      failed: 0,
    });
    expect(mocks.deleteFromR2).toHaveBeenCalledTimes(3);
    expect(mocks.deleteUser).toHaveBeenCalledWith(
      "11111111-1111-1111-1111-111111111111",
    );
    expect(mocks.deletionRecordUpdate).toHaveBeenLastCalledWith({
      where: { formerAuthId: "11111111-1111-1111-1111-111111111111" },
      data: { deletedAt: now, pendingStorageObjectKeys: [] },
    });
  });

  it("他プロフィールから参照中のR2オブジェクトは削除しない", async () => {
    mocks.profileCount.mockImplementation(({ where }) =>
      Promise.resolve(where.audioKey.endsWith("current.m4a") ? 1 : 0),
    );

    await deleteModeratedAccount("profile-1", now);

    expect(mocks.deleteFromR2).toHaveBeenCalledTimes(1);
    expect(mocks.deleteFromR2).toHaveBeenCalledWith("audio/user/old.m4a");
  });

  it("保存済みの禁止記録があればAuthユーザー削除後の再試行を継続できる", async () => {
    mocks.deletionRecordFindUnique.mockResolvedValue({
      id: "record-1",
      pendingStorageObjectKeys: [],
    });
    mocks.getUserById.mockResolvedValue({
      data: { user: null },
      error: { status: 404, code: "user_not_found" },
    });

    await expect(deleteModeratedAccount("profile-1", now)).resolves.toEqual({
      status: "deleted",
    });
    expect(mocks.createFingerprints).not.toHaveBeenCalled();
    expect(mocks.deleteUser).not.toHaveBeenCalled();
    expect(mocks.txProfileDelete).toHaveBeenCalled();
  });

  it("利用データ削除後に残ったAuth削除を再試行して完了日時を記録する", async () => {
    mocks.deletionRecordFindMany.mockResolvedValue([
      {
        formerAuthId: "11111111-1111-1111-1111-111111111111",
        pendingStorageObjectKeys: [],
      },
    ]);
    mocks.profileCount.mockResolvedValue(0);

    await expect(completePendingAccountAuthDeletions(now)).resolves.toEqual({
      examined: 1,
      completed: 1,
      skipped: 0,
      failed: 0,
    });
    expect(mocks.deleteUser).toHaveBeenCalledWith(
      "11111111-1111-1111-1111-111111111111",
    );
    expect(mocks.deletionRecordUpdate).toHaveBeenCalledWith({
      where: { formerAuthId: "11111111-1111-1111-1111-111111111111" },
      data: { deletedAt: now, pendingStorageObjectKeys: [] },
    });
  });

  it("利用データが残る準備中記録ではAuthを削除しない", async () => {
    mocks.deletionRecordFindMany.mockResolvedValue([
      {
        formerAuthId: "11111111-1111-1111-1111-111111111111",
        pendingStorageObjectKeys: [],
      },
    ]);
    mocks.profileCount.mockResolvedValue(1);

    const result = await completePendingAccountAuthDeletions(now);

    expect(result.skipped).toBe(1);
    expect(mocks.getUserById).not.toHaveBeenCalled();
    expect(mocks.deleteUser).not.toHaveBeenCalled();
  });
});
