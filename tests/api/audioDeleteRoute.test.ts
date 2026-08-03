import { beforeEach, describe, expect, it, vi } from "vitest";

const { mocks } = vi.hoisted(() => ({
  mocks: {
    getUser: vi.fn(),
    transaction: vi.fn(),
    findUnique: vi.fn(),
    updateMany: vi.fn(),
    moderationCaseFindFirst: vi.fn(),
    moderationCaseCreate: vi.fn(),
    moderationCaseUpdate: vi.fn(),
    moderationSnapshotFindFirst: vi.fn(),
    moderationSnapshotCreate: vi.fn(),
    moderationCaseEventCreate: vi.fn(),
    extractKeyFromUrl: vi.fn(),
    deleteFromR2: vi.fn(),
  },
}));

vi.mock("@/lib/supabaseClient", () => ({
  createServerSupabaseClient: () => ({ auth: { getUser: mocks.getUser } }),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: mocks.transaction,
    profile: {
      findUnique: mocks.findUnique,
      updateMany: mocks.updateMany,
    },
  },
}));
vi.mock("@/lib/r2Storage", () => ({
  extractKeyFromUrl: mocks.extractKeyFromUrl,
  deleteFromR2: mocks.deleteFromR2,
}));

import { DELETE } from "@/app/(site)/api/audio/route";

const request = () =>
  new Request("http://localhost/api/audio", {
    method: "DELETE",
    headers: { Authorization: "Bearer valid-token" },
  });

describe("DELETE /api/audio", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "auth-user-1" } },
      error: null,
    });
    mocks.findUnique.mockResolvedValue({
      id: "profile-1",
      audioUrl: "https://r2.example/audio/test/old.m4a",
      audioKey: "audio/test/old.m4a",
      audioContentHash: "a".repeat(64),
      audioTitle: "古い音声",
      audioStatus: "active",
    });
    mocks.transaction.mockImplementation(async (callback) =>
      callback({
        profile: { updateMany: mocks.updateMany },
        moderationCase: {
          findFirst: mocks.moderationCaseFindFirst,
          create: mocks.moderationCaseCreate,
          update: mocks.moderationCaseUpdate,
        },
        moderationSnapshot: {
          findFirst: mocks.moderationSnapshotFindFirst,
          create: mocks.moderationSnapshotCreate,
        },
        moderationCaseEvent: {
          create: mocks.moderationCaseEventCreate,
        },
      }),
    );
    mocks.moderationCaseFindFirst.mockResolvedValue(null);
    mocks.moderationCaseCreate.mockResolvedValue({ id: "case-1" });
    mocks.moderationCaseUpdate.mockResolvedValue({ id: "case-1" });
    mocks.moderationSnapshotFindFirst.mockResolvedValue(null);
    mocks.moderationSnapshotCreate.mockResolvedValue({ id: "snapshot-1" });
    mocks.moderationCaseEventCreate.mockResolvedValue({ id: "event-1" });
    mocks.extractKeyFromUrl.mockReturnValue("audio/test/old.m4a");
    mocks.deleteFromR2.mockResolvedValue(undefined);
    mocks.updateMany.mockResolvedValue({ count: 1 });
  });

  it("本人のR2音源を削除してプロフィールを未登録にする", async () => {
    const response = await DELETE(request());

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(mocks.findUnique).toHaveBeenCalledWith({
      where: { authId: "auth-user-1" },
      select: {
        id: true,
        audioUrl: true,
        audioKey: true,
        audioContentHash: true,
        audioTitle: true,
        audioStatus: true,
      },
    });
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: {
        authId: "auth-user-1",
        audioUrl: "https://r2.example/audio/test/old.m4a",
        audioKey: "audio/test/old.m4a",
        audioStatus: "active",
      },
      data: {
        audioUrl: "",
        audioKey: "",
        audioTitle: "",
        audioStatus: "active",
      },
    });
    expect(mocks.deleteFromR2).toHaveBeenCalledWith("audio/test/old.m4a");
    expect(mocks.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.deleteFromR2.mock.invocationCallOrder[0],
    );
  });

  it("音声が未登録の場合も成功レスポンスをキャッシュしない", async () => {
    mocks.findUnique.mockResolvedValueOnce({
      audioUrl: "",
      audioKey: "",
      id: "profile-1",
      audioTitle: "",
      audioStatus: "active",
    });

    const response = await DELETE(request());

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(mocks.updateMany).not.toHaveBeenCalled();
    expect(mocks.deleteFromR2).not.toHaveBeenCalled();
  });

  it("非公開音声を削除して削除済み状態へ遷移する", async () => {
    mocks.findUnique.mockResolvedValueOnce({
      audioUrl: "https://r2.example/audio/test/hidden.m4a",
      audioKey: "audio/test/hidden.m4a",
      audioContentHash: "b".repeat(64),
      id: "profile-1",
      audioTitle: "非公開音声",
      audioStatus: "hidden",
    });

    const response = await DELETE(request());

    expect(response.status).toBe(200);
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: {
        authId: "auth-user-1",
        audioUrl: "https://r2.example/audio/test/hidden.m4a",
        audioKey: "audio/test/hidden.m4a",
        audioStatus: "hidden",
      },
      data: {
        audioUrl: "",
        audioKey: "",
        audioTitle: "",
        audioStatus: "removed",
      },
    });
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      audioStatus: "removed",
    });
    expect(mocks.deleteFromR2).not.toHaveBeenCalled();
    expect(mocks.moderationCaseCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        profileId: "profile-1",
        targetType: "audio",
        targetId: "profile-1",
        reviewMode: "postReview",
        status: "postReviewPending",
      }),
      select: { id: true },
    });
    expect(mocks.moderationSnapshotCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        moderationCaseId: "case-1",
        kind: "reported",
        storageObjectKey: "audio/test/hidden.m4a",
        contentHash: "b".repeat(64),
      }),
    });
    expect(mocks.moderationCaseEventCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        moderationCaseId: "case-1",
        eventType: "contentDeleted",
        actorType: "user",
        actorId: "auth-user-1",
        newStatus: "postReviewPending",
      }),
    });
  });

  it("音声なしで非公開状態だけが残ったプロフィールを削除済みに修復する", async () => {
    mocks.findUnique.mockResolvedValueOnce({
      audioUrl: "",
      audioKey: "",
      id: "profile-1",
      audioTitle: "",
      audioStatus: "hidden",
    });

    const response = await DELETE(request());

    expect(response.status).toBe(200);
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: {
        authId: "auth-user-1",
        audioUrl: "",
        audioKey: "",
        audioStatus: "hidden",
      },
      data: { audioStatus: "removed" },
    });
    expect(mocks.deleteFromR2).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      audioStatus: "removed",
    });
  });

  it("R2削除に失敗してもプロフィールの参照解除は成功として返す", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.deleteFromR2.mockRejectedValue(new Error("R2 error"));

    try {
      const response = await DELETE(request());

      expect(response.status).toBe(200);
      expect(mocks.updateMany).toHaveBeenCalled();
      expect(consoleError).toHaveBeenCalledWith(
        "Failed to delete unreferenced audio file from R2:",
        expect.any(Error),
      );
    } finally {
      consoleError.mockRestore();
    }
  });

  it("取得後に音声が更新されていた場合は削除を中止する", async () => {
    mocks.updateMany.mockResolvedValueOnce({ count: 0 });

    const response = await DELETE(request());

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "音源が更新されているため削除を中止しました。",
    });
    expect(mocks.deleteFromR2).not.toHaveBeenCalled();
  });

  it("DB更新に失敗した場合はR2音声を削除しない", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.updateMany.mockRejectedValueOnce(new Error("database error"));

    try {
      const response = await DELETE(request());

      expect(response.status).toBe(500);
      expect(mocks.deleteFromR2).not.toHaveBeenCalled();
    } finally {
      consoleError.mockRestore();
    }
  });
});
