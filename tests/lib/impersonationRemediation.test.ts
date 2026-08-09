import { describe, expect, it } from "vitest";
import { getIncompleteImpersonationRemediationFields } from "@/lib/impersonationRemediation";

const before = {
  displayName: "なりすまし前",
  bio: "以前の自己紹介",
  theme: "normal",
  audio: {
    hasAudio: true,
    contentHash: "a".repeat(64),
    storageKey: "audio/user/before.m4a",
  },
  socialLinks: [
    {
      id: "link-1",
      service: "youtube",
      url: "https://www.youtube.com/@before",
      label: "以前のYouTube",
    },
  ],
};

const changedCurrent = {
  displayName: "修正後の名前",
  bio: "修正後の自己紹介",
  theme: "dark",
  audioKey: "audio/user/after.m4a",
  audioUrl: "",
  audioContentHash: "b".repeat(64),
  socialLinks: [
    {
      id: "link-1",
      service: "youtube",
      url: "https://www.youtube.com/@after",
      label: "修正後のYouTube",
    },
  ],
};

describe("なりすまし修正の完全性", () => {
  it("処分時点の入力項目がすべて変更されていれば完了とする", () => {
    expect(
      getIncompleteImpersonationRemediationFields(before, changedCurrent),
    ).toEqual([]);
  });

  it("変更されていないプロフィール項目、音声、リンクを返す", () => {
    expect(
      getIncompleteImpersonationRemediationFields(before, {
        ...changedCurrent,
        displayName: "なりすまし前",
        audioContentHash: "a".repeat(64),
        socialLinks: [
          {
            id: "link-1",
            service: "youtube",
            url: "https://www.youtube.com/@before/",
            label: "以前のYouTube",
          },
        ],
      }),
    ).toEqual(["表示名", "音声", "リンク（以前のYouTube）"]);
  });

  it("音声・リンクの削除は修正として扱う", () => {
    expect(
      getIncompleteImpersonationRemediationFields(before, {
        ...changedCurrent,
        audioKey: "",
        audioContentHash: null,
        socialLinks: [],
      }),
    ).toEqual([]);
  });

  it("旧スナップショットに存在しない音声とリンクは判定対象にしない", () => {
    expect(
      getIncompleteImpersonationRemediationFields(
        {
          displayName: "なりすまし前",
          bio: "以前の自己紹介",
          theme: "normal",
        },
        {
          ...changedCurrent,
          audioContentHash: "a".repeat(64),
          socialLinks: [
            {
              id: "link-1",
              service: "youtube",
              url: "https://www.youtube.com/@before",
              label: "以前のYouTube",
            },
          ],
        },
      ),
    ).toEqual([]);
  });
});
