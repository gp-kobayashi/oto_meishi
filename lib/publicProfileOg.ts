import type { ProfileData } from "@/lib/mock/profileData";
import {
  createProfileDescription,
  normalizeProfileText,
} from "@/lib/publicProfileMetadata";

const OG_BIO_LIMIT = 110;

const palettes = {
  normal: {
    background: "#f5f7fb",
    foreground: "#172033",
    accent: "#2563eb",
    muted: "#52627a",
  },
  dark: {
    background: "#111827",
    foreground: "#f8fafc",
    accent: "#60a5fa",
    muted: "#cbd5e1",
  },
  light: {
    background: "#ffffff",
    foreground: "#172033",
    accent: "#0f766e",
    muted: "#52627a",
  },
  colorful: {
    background: "#fff1f2",
    foreground: "#3b0764",
    accent: "#db2777",
    muted: "#86198f",
  },
} as const;

const truncateCodePoints = (value: string, limit: number) => {
  const codePoints = Array.from(value);
  return codePoints.length > limit
    ? `${codePoints.slice(0, limit - 1).join("")}…`
    : value;
};

export function createProfileOgPresentation(
  profile: Pick<ProfileData, "displayName" | "bio" | "theme">,
) {
  const palette = palettes[profile.theme] ?? palettes.normal;
  const displayName = truncateCodePoints(
    normalizeProfileText(profile.displayName) || "oto_meishi",
    48,
  );
  const bio = truncateCodePoints(
    createProfileDescription(profile.displayName, profile.bio),
    OG_BIO_LIMIT,
  );

  return { displayName, bio, palette };
}
