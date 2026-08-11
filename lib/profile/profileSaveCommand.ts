import type { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import type { ModeratedProfileContent } from "@/lib/moderationRemediation";
import { recordModeratedProfileCorrection } from "@/lib/profile/profileModeration";
import {
  type ComparableSocialLink,
  type ExistingSocialLink,
  syncSocialLinks,
} from "@/lib/profile/profileLinks";
import { ownerModerationCasesQuery } from "@/lib/profile/queries";

type ProfileSaveExistingProfile = Prisma.ProfileGetPayload<{
  include: {
    sns: true;
    moderationCases: {
      where: {
        targetType: "socialLink";
        retentionExpiresAt: { gt: Date };
      };
      select: {
        snapshots: {
          where: { kind: "reported" };
          select: { content: true; contentHash: true };
        };
      };
    };
  };
}>;

export async function executeProfileSave({
  existingProfile,
  userId,
  authId,
  displayName,
  bio,
  audioTitle,
  theme,
  socialLinks,
  preserveExistingLinks,
}: {
  existingProfile: ProfileSaveExistingProfile | null;
  userId: string;
  authId: string;
  displayName: string;
  bio: string;
  audioTitle: string;
  theme: NonNullable<Prisma.ProfileCreateInput["theme"]>;
  socialLinks: ComparableSocialLink[];
  preserveExistingLinks: boolean;
}) {
  return prisma.$transaction(async (transaction) => {
    let profileId: string;

    if (!existingProfile) {
      const createdProfile = await transaction.profile.create({
        data: {
          userId,
          authId,
          displayName: displayName || userId,
          bio,
          audioUrl: "",
          audioKey: "",
          audioTitle,
          theme,
          sns: { create: [] },
        },
        include: { sns: true },
      });
      profileId = createdProfile.id;
    } else {
      const reportedProfileContent: ModeratedProfileContent = {
        displayName: existingProfile.displayName,
        bio: existingProfile.bio,
        theme: existingProfile.theme,
      };
      const correctedProfileContent: ModeratedProfileContent = {
        displayName: displayName || userId,
        bio,
        theme,
      };
      const profileCorrection = await recordModeratedProfileCorrection({
        transaction,
        profileId: existingProfile.id,
        reportedContent: reportedProfileContent,
        correctedContent: correctedProfileContent,
        actorId: authId,
      });
      await transaction.profile.update({
        where: { userId },
        data: {
          displayName: displayName || userId,
          bio,
          audioTitle,
          theme,
          ...(profileCorrection
            ? { status: profileCorrection.profileStatus }
            : {}),
        },
        include: { sns: true },
      });
      profileId = existingProfile.id;
    }

    if (!preserveExistingLinks) {
      const existingLinks: ExistingSocialLink[] = (
        existingProfile?.sns ?? []
      ).map((link) => ({ ...link, status: link.status ?? "active" }));
      await syncSocialLinks({
        transaction,
        profileId,
        existingLinks,
        requestedLinks: socialLinks,
        actorId: authId,
      });
    }

    return transaction.profile.findUnique({
      where: { userId },
      include: { sns: true, moderationCases: ownerModerationCasesQuery },
    });
  });
}
