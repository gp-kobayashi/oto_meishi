import type { SocialLink } from "@/lib/mock/profileData";

export type ReportableSocialLink = Omit<SocialLink, "id"> & {
  id: string;
};
