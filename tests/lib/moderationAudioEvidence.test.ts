import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  canDeleteAudioObject,
  getAudioObjectReferenceState,
} from "@/lib/moderationAudioEvidence";

const profileFindFirst = vi.fn();
const lifecycleFindFirst = vi.fn();
const client = {
  profile: { findFirst: profileFindFirst },
  moderationSnapshotEvidenceLifecycle: { findFirst: lifecycleFindFirst },
} as unknown as Parameters<typeof getAudioObjectReferenceState>[0];

describe("モデレーション音声の参照判定", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    profileFindFirst.mockResolvedValue(null);
    lifecycleFindFirst.mockResolvedValue(null);
  });

  it("現在のプロフィールと期限内スナップショットを同時に確認する", async () => {
    const now = new Date("2026-08-03T00:00:00.000Z");
    profileFindFirst.mockResolvedValueOnce({ id: "profile-1" });
    lifecycleFindFirst.mockResolvedValueOnce({ id: "lifecycle-1" });
    lifecycleFindFirst.mockResolvedValueOnce({ id: "lifecycle-2" });

    await expect(
      getAudioObjectReferenceState(
        client,
        " audio/testuser/reported.m4a ",
        now,
      ),
    ).resolves.toEqual({
      referencedByCurrentProfile: true,
      referencedByUnexpiredSnapshot: true,
      referencedByUnresolvedCase: true,
    });
    expect(profileFindFirst).toHaveBeenCalledWith({
      where: {
        OR: [
          { audioKey: "audio/testuser/reported.m4a" },
          { audioUrl: { contains: "audio/testuser/reported.m4a" } },
        ],
      },
      select: { id: true },
    });
    expect(lifecycleFindFirst).toHaveBeenCalledWith({
      where: {
        deletedAt: null,
        retainUntil: { gt: now },
        snapshot: { storageObjectKey: "audio/testuser/reported.m4a" },
      },
      select: { snapshotId: true },
    });
    expect(lifecycleFindFirst).toHaveBeenCalledWith({
      where: {
        deletedAt: null,
        snapshot: {
          storageObjectKey: "audio/testuser/reported.m4a",
          moderationCase: { status: { not: "confirmed" } },
        },
      },
      select: { snapshotId: true },
    });
  });

  it("どちらからも参照されていない音声だけ削除可能と判定する", async () => {
    const state = await getAudioObjectReferenceState(
      client,
      "audio/testuser/orphan.m4a",
    );

    expect(canDeleteAudioObject(state)).toBe(true);
    expect(
      canDeleteAudioObject({
        referencedByCurrentProfile: false,
        referencedByUnexpiredSnapshot: true,
        referencedByUnresolvedCase: false,
      }),
    ).toBe(false);
    expect(
      canDeleteAudioObject({
        referencedByCurrentProfile: false,
        referencedByUnexpiredSnapshot: false,
        referencedByUnresolvedCase: true,
      }),
    ).toBe(false);
  });

  it("空のキーではDBへ問い合わせない", async () => {
    await expect(getAudioObjectReferenceState(client, "  ")).resolves.toEqual({
      referencedByCurrentProfile: false,
      referencedByUnexpiredSnapshot: false,
      referencedByUnresolvedCase: false,
    });
    expect(profileFindFirst).not.toHaveBeenCalled();
    expect(lifecycleFindFirst).not.toHaveBeenCalled();
  });
});
