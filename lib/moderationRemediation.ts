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
