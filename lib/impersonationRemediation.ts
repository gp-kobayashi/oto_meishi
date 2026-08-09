import {
  compareModeratedContentHashes,
  compareModeratedUrls,
} from "@/lib/moderationRemediation";

type CurrentSocialLink = {
  id: string;
  service: string;
  url: string;
  label: string;
};

type CurrentProfileContent = {
  displayName: string;
  bio: string;
  theme: string;
  audioKey: string;
  audioUrl: string;
  audioContentHash: string | null;
  socialLinks: CurrentSocialLink[];
};

const profileFieldLabels = {
  displayName: "表示名",
  bio: "自己紹介",
  theme: "テーマ",
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUnchangedLink(
  reported: Record<string, unknown>,
  current: CurrentSocialLink,
): boolean {
  return (
    reported.service === current.service &&
    reported.label === current.label &&
    typeof reported.url === "string" &&
    compareModeratedUrls(reported.url, current.url) === "same"
  );
}

/**
 * なりすまし処分時点の登録内容と比較し、未修正の項目名を返す。
 * 旧スナップショットに存在しない項目は、後方互換のため判定対象外とする。
 */
export function getIncompleteImpersonationRemediationFields(
  reportedContent: unknown,
  current: CurrentProfileContent,
): string[] {
  if (!isRecord(reportedContent)) return ["処分時点の登録内容"];

  const incomplete = (Object.entries(profileFieldLabels) as Array<
    [keyof typeof profileFieldLabels, string]
  >).flatMap(([field, label]) =>
    typeof reportedContent[field] === "string" &&
    reportedContent[field] === current[field]
      ? [label]
      : [],
  );

  if (isRecord(reportedContent.audio) && reportedContent.audio.hasAudio === true) {
    const reportedHash = reportedContent.audio.contentHash;
    const reportedKey = reportedContent.audio.storageKey;
    const audioRemoved = !current.audioKey && !current.audioUrl;
    const audioChanged =
      typeof reportedHash === "string" && current.audioContentHash
        ? compareModeratedContentHashes(reportedHash, current.audioContentHash) ===
          "changed"
        : typeof reportedKey === "string"
          ? reportedKey !== current.audioKey
          : false;
    if (!audioRemoved && !audioChanged) incomplete.push("音声");
  }

  if (Array.isArray(reportedContent.socialLinks)) {
    for (const reportedLink of reportedContent.socialLinks) {
      if (!isRecord(reportedLink) || typeof reportedLink.id !== "string") continue;
      const currentLink = current.socialLinks.find(
        (link) => link.id === reportedLink.id,
      );
      if (currentLink && isUnchangedLink(reportedLink, currentLink)) {
        incomplete.push(`リンク（${reportedLink.label || reportedLink.service || "名称未設定"}）`);
      }
    }
  }

  return incomplete;
}

export type { CurrentProfileContent };
