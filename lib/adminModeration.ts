export const moderationFilters = [
  "all",
  "attention",
  "active",
  "hidden",
  "suspended",
] as const;

export type ModerationFilter = (typeof moderationFilters)[number];

export type ModerationListItem = {
  id: string;
  userId: string;
  displayName: string;
  status: "active" | "hidden" | "suspended";
  hasAudio: boolean;
  audioTitle: string;
  audioStatus: "active" | "hidden" | "removed";
  linkCount: number;
  hiddenLinkCount: number;
  pendingReportCount: number;
  pendingReviewCount: number;
  updatedAt: string;
};

export type ModerationListResponse = {
  items: ModerationListItem[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

export type ModerationDetailResponse = {
  profile: {
    id: string;
    userId: string;
    displayName: string;
    bio: string;
    theme: "normal" | "dark" | "light" | "colorful";
    status: "active" | "hidden" | "suspended";
    hasAudio: boolean;
    audioTitle: string;
    audioStatus: "active" | "hidden" | "removed";
    deletedAudio: {
      moderationCaseId: string;
      status:
        | "correctionRequired"
        | "postReviewPending"
        | "preReviewPending"
        | "confirmed";
      reviewMode: "postReview" | "preReview";
      reviewDueAt: string;
      previousTitle: string | null;
      previousStatus: string | null;
      deletedAt: string | null;
      deletedByType: "admin" | "user" | "system" | null;
      deletedByIdentifier: string | null;
    } | null;
    createdAt: string;
    updatedAt: string;
    links: {
      id: string;
      service: string;
      label: string;
      url: string;
      sortOrder: number;
      status: "active" | "hidden";
    }[];
    reports: {
      id: string;
      reason:
        | "inappropriate_audio"
        | "harassment"
        | "unsafe_link"
        | "impersonation"
        | "other";
      details: string;
      status: "pending" | "reviewed" | "resolved" | "dismissed";
      reviewNote: string;
      reviewerIdentifier: string | null;
      reviewerRole: "moderator" | "admin" | null;
      reviewedAt: string | null;
      createdAt: string;
      updatedAt: string;
      statusEvents: {
        id: string;
        previousStatus:
          | "pending"
          | "reviewed"
          | "resolved"
          | "dismissed"
          | null;
        newStatus: "pending" | "reviewed" | "resolved" | "dismissed";
        note: string;
        isBackfilled: boolean;
        adminIdentifier: string | null;
        adminRole: "moderator" | "admin" | null;
        createdAt: string;
      }[];
    }[];
    moderationRequests: {
      id: string;
      kind: "inquiry" | "accountAppeal";
      status: "pending" | "resolved" | "rejected";
      message: string;
      responseMessage: string;
      resolvedAt: string | null;
      createdAt: string;
      updatedAt: string;
    }[];
    moderationCases: {
      id: string;
      targetType: "profile" | "audio" | "socialLink";
      targetId: string;
      reasonCode:
        | "inappropriateContent"
        | "copyrightConcern"
        | "harassment"
        | "unsafeLink"
        | "serviceMismatch"
        | "impersonation"
        | "threatOrPersonalData"
        | "unofficialThirdPartyProfile"
        | "politicalReligiousPromotion"
        | "other";
      status:
        | "correctionRequired"
        | "postReviewPending"
        | "preReviewPending"
        | "confirmed";
      reviewMode: "postReview" | "preReview";
      userMessage: string;
      reviewDueAt: string;
      retentionExpiresAt: string;
      resolvedAt: string | null;
      createdAt: string;
      updatedAt: string;
      snapshots: {
        id: string;
        kind: "reported" | "corrected";
        content: unknown;
        contentHash: string | null;
        hasStoredAudio: boolean;
        expiresAt: string;
        createdAt: string;
      }[];
      events: {
        id: string;
        eventType:
          | "created"
          | "contentChanged"
          | "contentDeleted"
          | "statusChanged"
          | "reviewApproved"
          | "reviewRejected"
          | "accountSuspended"
          | "appealSubmitted"
          | "accountRestored"
          | "deletionScheduled"
          | "autoConfirmed";
        actorType: "admin" | "user" | "system";
        actorIdentifier: string | null;
        previousStatus:
          | "correctionRequired"
          | "postReviewPending"
          | "preReviewPending"
          | "confirmed"
          | null;
        newStatus:
          | "correctionRequired"
          | "postReviewPending"
          | "preReviewPending"
          | "confirmed"
          | null;
        details: unknown;
        createdAt: string;
      }[];
    }[];
    violationSummary: {
      activeCount: number;
      countsByReason: Record<string, number>;
    };
    violationEvents: {
      id: string;
      moderationCaseId: string;
      eventType: "confirmed" | "revoked";
      reasonCode:
        | "inappropriateContent"
        | "copyrightConcern"
        | "harassment"
        | "unsafeLink"
        | "serviceMismatch"
        | "impersonation"
        | "threatOrPersonalData"
        | "unofficialThirdPartyProfile"
        | "politicalReligiousPromotion"
        | "other";
      originalViolationEventId: string | null;
      suspensionTriggered: boolean;
      note: string;
      isActive: boolean;
      adminIdentifier: string | null;
      adminRole: "moderator" | "admin" | null;
      createdAt: string;
    }[];
    history: {
      id: string;
      targetType: "profile" | "audio" | "socialLink";
      targetId: string;
      action: "hide" | "restore" | "suspend" | "scheduleDeletion" | "remove";
      actorType: "admin" | "system";
      previousStatus: string;
      newStatus: string;
      reason: string;
      adminIdentifier: string | null;
      adminRole: "moderator" | "admin" | null;
      createdAt: string;
    }[];
  };
};

export function isModerationFilter(value: string): value is ModerationFilter {
  return moderationFilters.some((filter) => filter === value);
}
