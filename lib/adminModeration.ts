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
    }[];
    history: {
      id: string;
      targetType: "profile" | "audio" | "socialLink";
      targetId: string;
      action: "hide" | "restore" | "suspend" | "remove";
      previousStatus: string;
      newStatus: string;
      reason: string;
      adminIdentifier: string;
      adminRole: "moderator" | "admin";
      createdAt: string;
    }[];
  };
};

export function isModerationFilter(value: string): value is ModerationFilter {
  return moderationFilters.some((filter) => filter === value);
}
