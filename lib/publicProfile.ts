import { cache } from "react";
import type { ProfileData } from "@/lib/mock/profileData";
import { prisma } from "@/lib/prisma";

/**
 * Loads the subset of a profile that can be displayed publicly.
 *
 * The visibility checks intentionally live in the database query so callers
 * cannot accidentally render a profile that is hidden or under account-level
 * moderation. React cache keeps page and metadata consumers on the same
 * request from issuing duplicate queries.
 */
export const getPublicProfile = cache(
  async (userId: string): Promise<ProfileData | null> => {
    const profile = await prisma.profile.findFirst({
      where: {
        userId,
        status: "active",
        accountModerationStatus: "active",
      },
      include: { sns: true },
    });

    if (!profile) return null;

    const hasAudio =
      profile.audioStatus === "active" &&
      Boolean(profile.audioKey || profile.audioUrl);

    return {
      id: profile.id,
      userId: profile.userId,
      theme: profile.theme,
      displayName: profile.displayName,
      bio: profile.bio,
      audioUrl: "",
      hasAudio,
      audioTitle: hasAudio ? profile.audioTitle : "",
      sns: profile.sns
        .filter((link) => link.status === "active")
        .map(({ id, service, url, label }) => ({
          id,
          service,
          url,
          label,
          status: "active" as const,
        })),
    };
  },
);
