import type { User } from "@supabase/supabase-js";
import type { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import type { createServerSupabaseClient } from "@/lib/supabaseClient";
import { sanitizeProfileData } from "@/lib/apiValidation";
import { PRIVATE_NO_STORE_HEADERS } from "@/lib/httpCache";
import {
  areSocialLinksUnchanged,
  validateSocialLinks,
} from "@/lib/profile/profileLinks";
import { isRegistrationBanned } from "@/lib/registrationBan";

type ProfileInput = NonNullable<ReturnType<typeof sanitizeProfileData>["data"]>;
export type ProfileSaveExistingProfile = Prisma.ProfileGetPayload<{
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

type PreparationFailure = {
  ok: false;
  error: string;
  status: number;
  headers?: HeadersInit;
};

type PreparationSuccess = {
  ok: true;
  existingProfile: ProfileSaveExistingProfile | null;
  audioTitle: string;
  socialLinks: ProfileInput["sns"];
  preserveExistingLinks: boolean;
};

type ProfileSavePreparation = PreparationFailure | PreparationSuccess;

export async function prepareProfileSave({
  profileInput,
  hasAudioTitleInput,
  hasSocialLinksInput,
  supabaseUser,
  supabaseServer,
}: {
  profileInput: ProfileInput;
  hasAudioTitleInput: boolean;
  hasSocialLinksInput: boolean;
  supabaseUser: User;
  supabaseServer: ReturnType<typeof createServerSupabaseClient>;
}): Promise<ProfileSavePreparation> {
  const { userId, audioTitle, sns: socialLinks } = profileInput;
  const existingProfile = await prisma.profile.findUnique({
    where: { userId },
    include: {
      sns: true,
      moderationCases: {
        where: {
          targetType: "socialLink",
          retentionExpiresAt: { gt: new Date() },
        },
        select: {
          snapshots: {
            where: { kind: "reported" },
            select: { content: true, contentHash: true },
          },
        },
      },
    },
  });

  let audioTitleToSave = audioTitle;
  let socialLinksToSave = socialLinks;
  let preserveExistingLinks = false;

  if (!existingProfile) {
    const existingProfileByAuth = await prisma.profile.findUnique({
      where: { authId: supabaseUser.id },
    });
    if (existingProfileByAuth) {
      return {
        ok: false,
        error: "このアカウントはすでに別のユーザーIDで登録されています。",
        status: 400,
      };
    }

    if (await isRegistrationBanned(supabaseUser)) {
      const { error: deleteAuthError } =
        await supabaseServer.auth.admin.deleteUser(supabaseUser.id);
      if (deleteAuthError) {
        console.error("Failed to delete a prohibited Auth registration");
      }

      return {
        ok: false,
        error: "このアカウントは利用できません。",
        status: 403,
        headers: PRIVATE_NO_STORE_HEADERS,
      };
    }
  } else {
    if (!hasAudioTitleInput) {
      audioTitleToSave = existingProfile.audioTitle;
    }
    if (!hasSocialLinksInput) {
      socialLinksToSave = existingProfile.sns.map(
        ({ id, service, url, label, sortOrder }) => ({
          id,
          service,
          url,
          label,
          sortOrder,
        }),
      );
    }

    if (existingProfile.authId !== supabaseUser.id) {
      return {
        ok: false,
        error: "別のユーザーのプロフィールを変更する権限がありません。",
        status: 403,
      };
    }

    if (existingProfile.accountModerationStatus === "deletionPending") {
      return {
        ok: false,
        error: "削除手続き中のため、プロフィールを変更できません。",
        status: 403,
      };
    }

    preserveExistingLinks = areSocialLinksUnchanged(
      existingProfile.sns,
      socialLinksToSave,
    );
    const existingLinks = existingProfile.sns.map((link) => ({
      ...link,
      status: link.status ?? ("active" as const),
    }));
    const linkValidation = await validateSocialLinks(
      existingLinks,
      socialLinksToSave,
      existingProfile.moderationCases ?? [],
    );
    if (!linkValidation.ok) {
      return {
        ok: false,
        error: linkValidation.error,
        status: linkValidation.status,
      };
    }
  }

  return {
    ok: true,
    existingProfile,
    audioTitle: audioTitleToSave,
    socialLinks: socialLinksToSave,
    preserveExistingLinks,
  };
}
