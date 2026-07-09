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
  service: SocialService;
  url: string;
  label: string;
};
type theme = "normal" | "dark" | "light" | "colorful";

interface ProfileData {
  id: string;
  userId: string;
  theme: theme;
  displayName: string;
  bio: string;
  audioUrl: string;
  audioTitle: string;
  sns: SocialLink[];
}

export type { SocialService, SocialLink, ProfileData };
