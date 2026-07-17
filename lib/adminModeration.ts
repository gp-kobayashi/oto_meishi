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
  audioUrl: string;
  audioTitle: string;
  audioStatus: "active" | "hidden" | "removed";
  linkCount: number;
  hiddenLinkCount: number;
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

export function isModerationFilter(value: string): value is ModerationFilter {
  return moderationFilters.some((filter) => filter === value);
}
