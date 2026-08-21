import type { Metadata } from "next";
import type { ProfileData } from "@/lib/mock/profileData";
import { buildSiteUrl } from "@/lib/siteUrl";

export const PROFILE_DESCRIPTION_LIMIT = 160;

const normalizeText = (value: string) =>
  value
    .replace(/[\u0000-\u001f\u007f]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();

export function createProfileDescription(
  displayName: string,
  bio: string,
): string {
  const normalizedBio = normalizeText(bio);
  const fallback = `${normalizeText(displayName) || "oto_meishi"}さんの公開プロフィール`;
  const description = normalizedBio || fallback;

  return Array.from(description).slice(0, PROFILE_DESCRIPTION_LIMIT).join("");
}

export function createPublicProfileMetadata(
  profile: Pick<ProfileData, "displayName" | "bio">,
  userId: string,
): Metadata {
  const displayName = normalizeText(profile.displayName) || "oto_meishi";
  const title = `${displayName} | oto_meishi`;
  const description = createProfileDescription(displayName, profile.bio);
  const url = buildSiteUrl(encodeURIComponent(userId));

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      siteName: "oto_meishi",
      locale: "ja_JP",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}
