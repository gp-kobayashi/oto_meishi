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
interface ProfileData {
  id: string;
  username: string;
  card: string;
  displayName: string;
  bio: string;
  audioUrl: string;
  audioTitle: string;
  sns: SocialLink[];
}

export type { SocialService, SocialLink, ProfileData };
