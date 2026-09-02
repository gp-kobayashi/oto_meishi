export const MODERATION_REVIEW_PERIOD_DAYS = 60;

export const MODERATION_REASON_CODES = [
  "inappropriateContent",
  "copyrightConcern",
  "harassment",
  "unsafeLink",
  "serviceMismatch",
  "impersonation",
  "threatOrPersonalData",
  "unofficialThirdPartyProfile",
  "politicalReligiousPromotion",
  "other",
] as const;

export type ModerationReasonCode = (typeof MODERATION_REASON_CODES)[number];
export type ModerationReviewMode = "postReview" | "preReview";
export type ModerationPendingStatus =
  | "postReviewPending"
  | "preReviewPending";
export type ModeratedUrlComparison = "same" | "changed" | "invalid";
export type ModerationSnapshotVersionComparison =
  | "current"
  | "stale"
  | "missing";
export const MODERATED_PROFILE_FIELDS = [
  "displayName",
  "bio",
  "theme",
] as const;
export type ModeratedProfileField = (typeof MODERATED_PROFILE_FIELDS)[number];
export type ModeratedProfileContent = Record<ModeratedProfileField, string>;

export function isModerationReasonCode(
  value: string,
): value is ModerationReasonCode {
  return MODERATION_REASON_CODES.includes(value as ModerationReasonCode);
}

/**
 * 理由にかかわらず、修正内容は管理者が確認するまで公開しない。
 */
export function resolveModerationReviewMode(
  reasonCode: string,
): ModerationReviewMode {
  if (!isModerationReasonCode(reasonCode)) {
    return "preReview";
  }

  return "preReview";
}

export function getPendingStatusForReviewMode(
  reviewMode: ModerationReviewMode,
): ModerationPendingStatus {
  return reviewMode === "postReview"
    ? "postReviewPending"
    : "preReviewPending";
}

export function isPublishedWhilePending(
  status: ModerationPendingStatus,
): boolean {
  return status === "postReviewPending";
}

export function getModerationDeadline(from: Date = new Date()): Date {
  const deadline = new Date(from);
  deadline.setUTCDate(deadline.getUTCDate() + MODERATION_REVIEW_PERIOD_DAYS);
  return deadline;
}

export function getChangedModeratedProfileFields(
  reported: ModeratedProfileContent,
  corrected: ModeratedProfileContent,
): ModeratedProfileField[] {
  return MODERATED_PROFILE_FIELDS.filter(
    (field) => reported[field] !== corrected[field],
  );
}

/**
 * 表記差だけで修正済みと判定されないよう、比較専用のURLへ正規化する。
 */
export function normalizeModeratedUrl(value: string): string | null {
  try {
    const url = new URL(value.trim());

    if (url.protocol !== "https:" || url.username || url.password) {
      return null;
    }

    url.hash = "";
    url.hostname = url.hostname.toLowerCase();
    url.searchParams.sort();

    if (url.pathname !== "/") {
      url.pathname = url.pathname.replace(/\/+$/, "");
    }

    return url.toString();
  } catch {
    return null;
  }
}

export function compareModeratedUrls(
  previousUrl: string,
  correctedUrl: string,
): ModeratedUrlComparison {
  const previous = normalizeModeratedUrl(previousUrl);
  const corrected = normalizeModeratedUrl(correctedUrl);

  if (!previous || !corrected) {
    return "invalid";
  }

  return previous === corrected ? "same" : "changed";
}

export async function createModeratedUrlHash(
  value: string,
): Promise<string | null> {
  const normalizedUrl = normalizeModeratedUrl(value);
  if (!normalizedUrl) return null;

  return createModerationContentHash(new TextEncoder().encode(normalizedUrl));
}

export async function createModerationContentHash(
  content: ArrayBuffer | Uint8Array,
): Promise<string> {
  const bytes =
    content instanceof Uint8Array
      ? new Uint8Array(content)
      : new Uint8Array(content.slice(0));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);

  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export function compareModeratedContentHashes(
  previousHash: string,
  correctedHash: string,
): "same" | "changed" {
  return previousHash.trim().toLowerCase() === correctedHash.trim().toLowerCase()
    ? "same"
    : "changed";
}

export function compareModerationSnapshotVersions(
  reviewedSnapshotId: string | null | undefined,
  latestSnapshotId: string | null | undefined,
): ModerationSnapshotVersionComparison {
  if (!reviewedSnapshotId || !latestSnapshotId) return "missing";

  return reviewedSnapshotId === latestSnapshotId ? "current" : "stale";
}

export function compareModeratedProfileContent(
  snapshot: unknown,
  current: {
    displayName: string;
    bio: string;
    theme: string;
    audioKey: string;
    audioUrl: string;
    audioTitle: string;
    audioStatus: string;
    audioContentHash: string | null;
    socialLinks: Array<{
      id: string;
      service: string;
      label: string;
      url: string;
      status: string;
      sortOrder: number;
    }>;
  },
): boolean {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    return false;
  }
  const value = snapshot as Record<string, unknown>;
  if (
    value.displayName !== current.displayName ||
    value.bio !== current.bio ||
    value.theme !== current.theme
  ) {
    return false;
  }
  const audio = value.audio;
  const audioValue =
    audio && typeof audio === "object" && !Array.isArray(audio)
      ? (audio as Record<string, unknown>)
      : value;
  const snapshotHash = audioValue.contentHash ?? audioValue.audioContentHash;
  const hasSnapshotHash = typeof snapshotHash === "string";
  if (hasSnapshotHash) {
    if (
      !current.audioContentHash ||
      compareModeratedContentHashes(snapshotHash, current.audioContentHash) ===
        "changed"
    ) {
      return false;
    }
  }
  const hasAudioSnapshot =
    audio && typeof audio === "object" && !Array.isArray(audio);
  if (hasAudioSnapshot) {
    const snapshotAudioKey = audioValue.audioKey ?? audioValue.storageKey;
    const snapshotAudioTitle = audioValue.audioTitle ?? audioValue.title;
    const snapshotAudioStatus = audioValue.audioStatus ?? audioValue.status;
    if (
      !hasSnapshotHash &&
      typeof snapshotAudioKey === "string" &&
      snapshotAudioKey !== current.audioKey
    ) {
      return false;
    }
    if (
      typeof snapshotAudioTitle === "string" &&
      snapshotAudioTitle !== current.audioTitle
    ) {
      return false;
    }
    if (
      typeof snapshotAudioStatus === "string" &&
      snapshotAudioStatus !== current.audioStatus
    ) {
      return false;
    }
    if (
      typeof audioValue.hasAudio === "boolean" &&
      audioValue.hasAudio !== Boolean(current.audioKey || current.audioUrl)
    ) {
      return false;
    }
  }
  if (!Array.isArray(value.socialLinks)) return true;
  const normalizedLinks = value.socialLinks.map((link) => {
    if (!link || typeof link !== "object" || Array.isArray(link)) return null;
    const item = link as Record<string, unknown>;
    return {
      id: typeof item.id === "string" ? item.id : "",
      service: typeof item.service === "string" ? item.service : "",
      label: typeof item.label === "string" ? item.label : "",
      url: normalizeModeratedUrl(typeof item.url === "string" ? item.url : ""),
      status: typeof item.status === "string" ? item.status : "active",
      sortOrder: typeof item.sortOrder === "number" ? item.sortOrder : 0,
    };
  });
  const validLinks = normalizedLinks.filter(
    (link): link is NonNullable<typeof link> => link !== null,
  );
  if (validLinks.length !== current.socialLinks.length) {
    return false;
  }
  const sortLinks = <T extends { sortOrder: unknown; id: unknown }>(
    items: T[],
  ) =>
    [...items].sort(
      (left, right) =>
        Number(left.sortOrder) - Number(right.sortOrder) ||
        String(left.id).localeCompare(String(right.id)),
    );
  return (
    JSON.stringify(sortLinks(validLinks)) ===
    JSON.stringify(
      sortLinks(
        current.socialLinks.map((link) => ({
          ...link,
          url: normalizeModeratedUrl(link.url),
        })),
      ),
    )
  );
}
