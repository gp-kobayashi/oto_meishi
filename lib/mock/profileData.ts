type SocialService =
  | "x"
  | "instagram"
  | "youtube"
  | "tiktok"
  | "github"
  | "discord"
  | "facebook"
  | "linkedin"
  | "bluesky"
  | "threads"
  | "note"
  | "website"
  | "other";

type SocialLink = {
  id?: string;
  service: SocialService;
  url: string;
  label: string;
  status?: "active" | "hidden";
};
type theme = "normal" | "dark" | "light" | "colorful";

type ModerationCase = {
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
    | "other";
  reviewMode: "postReview" | "preReview";
  status:
    | "correctionRequired"
    | "postReviewPending"
    | "preReviewPending"
    | "confirmed";
  userMessage: string;
  reviewDueAt: string;
};

interface ProfileData {
  id: string;
  userId: string;
  theme: theme;
  displayName: string;
  bio: string;
  audioUrl: string;
  audioKey?: string;
  hasAudio?: boolean;
  audioTitle: string;
  audioStatus?: "active" | "hidden" | "removed";
  sns: SocialLink[];
  moderationCases?: ModerationCase[];
}

export type { SocialService, SocialLink, ModerationCase, ProfileData };
