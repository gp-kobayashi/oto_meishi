import { describe, expect, it } from "vitest";

import {
  compareModeratedContentHashes,
  compareModeratedUrls,
  compareModerationSnapshotVersions,
  createModerationContentHash,
  createModeratedUrlHash,
  getChangedModeratedProfileFields,
  getModerationDeadline,
  getPendingStatusForReviewMode,
  isPublishedWhilePending,
  normalizeModeratedUrl,
  resolveModerationReviewMode,
} from "@/lib/moderationRemediation";

describe("モデレーション是正ルール", () => {
  it.each([
    "inappropriateContent",
    "copyrightConcern",
    "harassment",
    "unsafeLink",
    "serviceMismatch",
    "impersonation",
    "other",
    "unknown",
  ])(
    "%sは管理者確認まで非公開にする",
    (reasonCode) => {
      expect(resolveModerationReviewMode(reasonCode)).toBe("preReview");
    },
  );

  it("審査方式から待機状態と公開可否を決定する", () => {
    const postReviewStatus = getPendingStatusForReviewMode("postReview");
    const preReviewStatus = getPendingStatusForReviewMode("preReview");

    expect(postReviewStatus).toBe("postReviewPending");
    expect(isPublishedWhilePending(postReviewStatus)).toBe(true);
    expect(preReviewStatus).toBe("preReviewPending");
    expect(isPublishedWhilePending(preReviewStatus)).toBe(false);
  });

  it("確認期限を60日後に設定する", () => {
    expect(
      getModerationDeadline(new Date("2026-07-30T00:00:00.000Z")),
    ).toEqual(new Date("2026-09-28T00:00:00.000Z"));
  });
});

describe("プロフィール本体の変更判定", () => {
  const reported = {
    displayName: "変更前の名前",
    bio: "変更前の自己紹介",
    theme: "normal",
  };

  it("変更された項目だけを返す", () => {
    expect(
      getChangedModeratedProfileFields(reported, {
        displayName: "変更後の名前",
        bio: "変更前の自己紹介",
        theme: "dark",
      }),
    ).toEqual(["displayName", "theme"]);
  });

  it("内容が同じ場合は変更項目を返さない", () => {
    expect(getChangedModeratedProfileFields(reported, { ...reported })).toEqual(
      [],
    );
  });

  it("表示名・自己紹介・テーマのすべてを判定する", () => {
    expect(
      getChangedModeratedProfileFields(reported, {
        displayName: "変更後の名前",
        bio: "変更後の自己紹介",
        theme: "colorful",
      }),
    ).toEqual(["displayName", "bio", "theme"]);
  });
});

describe("URLの同一内容判定", () => {
  it("表記だけが異なる同じURLを正規化する", () => {
    expect(
      normalizeModeratedUrl(
        "  https://YOUTUBE.com/channel/example/?b=2&a=1#profile  ",
      ),
    ).toBe("https://youtube.com/channel/example?a=1&b=2");
  });

  it("同じURLを修正として扱わない", () => {
    expect(
      compareModeratedUrls(
        "https://youtube.com/channel/example/",
        "https://YOUTUBE.com/channel/example#about",
      ),
    ).toBe("same");
  });

  it("異なるURLを変更として扱う", () => {
    expect(
      compareModeratedUrls(
        "https://youtube.com/channel/old",
        "https://youtube.com/channel/new",
      ),
    ).toBe("changed");
  });

  it("HTTPSでないURLや不正なURLを無効として扱う", () => {
    expect(
      compareModeratedUrls(
        "https://youtube.com/channel/old",
        "http://youtube.com/channel/new",
      ),
    ).toBe("invalid");
    expect(compareModeratedUrls("invalid", "https://example.com")).toBe(
      "invalid",
    );
  });

  it("正規化後に同じURLから同じ追跡用ハッシュを生成する", async () => {
    const first = await createModeratedUrlHash(
      "https://YOUTUBE.com/channel/example/?b=2&a=1#profile",
    );
    const second = await createModeratedUrlHash(
      "https://youtube.com/channel/example?a=1&b=2",
    );

    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(first).toBe(second);
  });

  it("無効なURLから追跡用ハッシュを生成しない", async () => {
    await expect(createModeratedUrlHash("http://example.com")).resolves.toBe(
      null,
    );
  });
});

describe("音声の同一内容判定", () => {
  it("同じバイト列から同じSHA-256ハッシュを生成する", async () => {
    const first = await createModerationContentHash(
      new TextEncoder().encode("audio-content"),
    );
    const second = await createModerationContentHash(
      new TextEncoder().encode("audio-content"),
    );

    expect(first).toHaveLength(64);
    expect(first).toBe(second);
    expect(compareModeratedContentHashes(first, second.toUpperCase())).toBe(
      "same",
    );
  });

  it("異なる音声ハッシュを変更として扱う", async () => {
    const previous = await createModerationContentHash(
      new TextEncoder().encode("previous-audio"),
    );
    const corrected = await createModerationContentHash(
      new TextEncoder().encode("corrected-audio"),
    );

    expect(compareModeratedContentHashes(previous, corrected)).toBe("changed");
  });
});

describe("審査対象スナップショットの版判定", () => {
  it("管理者が確認した版と最新の版が同じ場合はcurrentを返す", () => {
    expect(compareModerationSnapshotVersions("snapshot-2", "snapshot-2")).toBe(
      "current",
    );
  });

  it("審査中に新しい版が追加された場合はstaleを返す", () => {
    expect(compareModerationSnapshotVersions("snapshot-1", "snapshot-2")).toBe(
      "stale",
    );
  });

  it("比較対象が欠けている場合はmissingを返す", () => {
    expect(compareModerationSnapshotVersions(null, "snapshot-2")).toBe(
      "missing",
    );
    expect(compareModerationSnapshotVersions("snapshot-1", undefined)).toBe(
      "missing",
    );
  });
});
