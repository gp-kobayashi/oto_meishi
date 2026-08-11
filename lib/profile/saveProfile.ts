import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { prisma } from "@/lib/prisma";
import { createServerSupabaseClient } from "@/lib/supabaseClient";
import { sanitizeProfileData } from "@/lib/apiValidation";
import { PRIVATE_NO_STORE_HEADERS } from "@/lib/httpCache";
import { readJsonBody } from "@/lib/requestJson";
import { hasJsonContentType } from "@/lib/requestContentType";
import {
  consumeProfileSaveIpRateLimit,
  consumeProfileSaveUserRateLimit,
} from "@/lib/profileSaveRateLimit";
import {
  compareModeratedUrls,
  type ModeratedProfileContent,
} from "@/lib/moderationRemediation";
import {
  hasMatchingModeratedLinkUrl,
  recordModeratedLinkCorrection,
  recordModeratedProfileCorrection,
} from "@/lib/profile/profileModeration";
import { getClientIp } from "@/lib/clientIp";
import { ownerModerationCasesQuery } from "@/lib/profile/queries";
import { isRegistrationBanned } from "@/lib/registrationBan";

const MAX_PROFILE_REQUEST_BODY_BYTES = 64 * 1024;

type ProfileRequestBody = Parameters<typeof sanitizeProfileData>[0];

type ComparableSocialLink = {
  id?: string;
  service: string;
  url: string;
  label: string;
  sortOrder: number;
};

type ExistingSocialLink = ComparableSocialLink & {
  id: string;
  status: "active" | "hidden";
};

function toProfileRequestBody(value: unknown): ProfileRequestBody {
  return typeof value === "object" && value !== null
    ? (value as ProfileRequestBody)
    : {};
}

function areSocialLinksUnchanged(
  existingLinks: ComparableSocialLink[],
  requestedLinks: ComparableSocialLink[],
): boolean {
  if (existingLinks.length !== requestedLinks.length) return false;

  const sortedExisting = [...existingLinks].sort(
    (left, right) =>
      left.sortOrder - right.sortOrder ||
      (left.id ?? "").localeCompare(right.id ?? ""),
  );
  const sortedRequested = [...requestedLinks].sort(
    (left, right) => left.sortOrder - right.sortOrder,
  );

  return sortedExisting.every((existing, index) => {
    const requested = sortedRequested[index];
    return (
      requested !== undefined &&
      existing.service === requested.service &&
      existing.url === requested.url &&
      existing.label === requested.label &&
      existing.sortOrder === requested.sortOrder
    );
  });
}

function findRequestedExistingLink(
  existingLinks: ExistingSocialLink[],
  requestedLink: ComparableSocialLink,
): ExistingSocialLink | undefined {
  if (requestedLink.id) {
    return existingLinks.find((link) => link.id === requestedLink.id);
  }

  return existingLinks.find(
    (link) =>
      link.status === "active" && link.sortOrder === requestedLink.sortOrder,
  );
}

function isSocialLinkContentUnchanged(
  existing: ComparableSocialLink,
  requested: ComparableSocialLink,
): boolean {
  return (
    existing.service === requested.service &&
    existing.url === requested.url &&
    existing.label === requested.label
  );
}

export async function saveProfile(request: Request) {
  try {
    // Authorizationヘッダーの検証
    const authHeader = request.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "Unauthorized: Missing or invalid token" },
        { status: 401 },
      );
    }
    const token = authHeader.split(" ")[1];

    let supabaseUser: User | null = null;
    let supabaseServer: ReturnType<typeof createServerSupabaseClient>;
    try {
      supabaseServer = createServerSupabaseClient();
      const { data: { user }, error } = await supabaseServer.auth.getUser(token);
      if (error || !user) {
        return NextResponse.json(
          { error: "Unauthorized: Invalid token" },
          { status: 401 },
        );
      }
      supabaseUser = user;
    } catch {
      return NextResponse.json(
        { error: "Unauthorized: Token verification failed" },
        { status: 401 },
      );
    }

    const rateLimit = consumeProfileSaveUserRateLimit(supabaseUser.id);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          error:
            "プロフィール保存の回数が上限に達しました。しばらく待ってから再度お試しください。",
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(rateLimit.retryAfterSeconds),
            "X-RateLimit-Limit": String(rateLimit.limit),
            "X-RateLimit-Remaining": String(rateLimit.remaining),
            "X-RateLimit-Reset": String(Math.ceil(rateLimit.resetAt / 1000)),
          },
        },
      );
    }

    const clientIp = getClientIp(request.headers);
    if (clientIp) {
      const ipRateLimit = consumeProfileSaveIpRateLimit(clientIp);
      if (!ipRateLimit.allowed) {
        return NextResponse.json(
          {
            error:
              "この接続元からのプロフィール保存が集中しています。しばらく待ってから再度お試しください。",
          },
          {
            status: 429,
            headers: {
              "Retry-After": String(ipRateLimit.retryAfterSeconds),
              "X-RateLimit-Limit": String(ipRateLimit.limit),
              "X-RateLimit-Remaining": String(ipRateLimit.remaining),
              "X-RateLimit-Reset": String(
                Math.ceil(ipRateLimit.resetAt / 1000),
              ),
            },
          },
        );
      }
    }

    if (!hasJsonContentType(request)) {
      return NextResponse.json(
        { error: "Content-Typeはapplication/jsonを指定してください。" },
        { status: 415 },
      );
    }

    const jsonBody = await readJsonBody(request, MAX_PROFILE_REQUEST_BODY_BYTES);
    if (!jsonBody.ok) {
      return NextResponse.json(
        {
          error:
            jsonBody.error === "too_large"
              ? "プロフィールデータは64KB以下にしてください。"
              : "JSONの形式が不正です。",
        },
        { status: jsonBody.error === "too_large" ? 413 : 400 },
      );
    }

    const requestBody = toProfileRequestBody(jsonBody.value);
    const hasAudioTitleInput = Object.hasOwn(requestBody, "audioTitle");
    const hasSocialLinksInput = Object.hasOwn(requestBody, "sns");
    const { data: profileInput, error: validationError } =
      sanitizeProfileData(requestBody);

    if (validationError || !profileInput) {
      return NextResponse.json(
        { error: validationError?.message || "Invalid profile data" },
        { status: 400 },
      );
    }

    const {
      userId,
      displayName,
      bio,
      audioTitle,
      theme,
      sns: socialLinks,
    } = profileInput;

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
      // 新規作成時：このアカウントがすでに別のuserIdでプロフィールを作成していないか確認
      const existingProfileByAuth = await prisma.profile.findUnique({
        where: { authId: supabaseUser.id },
      });
      if (existingProfileByAuth) {
        return NextResponse.json(
          { error: "このアカウントはすでに別のユーザーIDで登録されています。" },
          { status: 400 },
        );
      }

      if (await isRegistrationBanned(supabaseUser)) {
        const { error: deleteAuthError } =
          await supabaseServer.auth.admin.deleteUser(supabaseUser.id);
        if (deleteAuthError) {
          console.error("Failed to delete a prohibited Auth registration");
        }

        return NextResponse.json(
          { error: "このアカウントは利用できません。" },
          { status: 403, headers: PRIVATE_NO_STORE_HEADERS },
        );
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

      // 未紐付けプロフィールをリクエストだけで取得できないよう、所有者の完全一致を必須にする
      if (existingProfile.authId !== supabaseUser.id) {
        return NextResponse.json(
          { error: "別のユーザーのプロフィールを変更する権限がありません。" },
          { status: 403 },
        );
      }


      if (existingProfile.accountModerationStatus === "deletionPending") {
        return NextResponse.json(
          { error: "削除手続き中のため、プロフィールを変更できません。" },
          { status: 403 },
        );
      }

      preserveExistingLinks = areSocialLinksUnchanged(
        existingProfile.sns,
        socialLinksToSave,
      );
      const existingLinks = existingProfile.sns.map((link) => ({
        ...link,
        status: link.status ?? ("active" as const),
      }));
      for (const requestedLink of socialLinksToSave) {
        if (
          requestedLink.id &&
          !existingLinks.some((link) => link.id === requestedLink.id)
        ) {
          return NextResponse.json(
            { error: "プロフィールに属さないリンクは変更できません。" },
            { status: 403 },
          );
        }

        const existingLink = findRequestedExistingLink(
          existingLinks,
          requestedLink,
        );
        if (
          !existingLink &&
          (await hasMatchingModeratedLinkUrl(
            existingProfile.moderationCases ?? [],
            requestedLink.url,
          ))
        ) {
          return NextResponse.json(
            {
              error:
                "過去に非公開となったリンクと同じURLです。別のURLを登録してください。",
            },
            { status: 409 },
          );
        }
        if (
          existingLink?.status === "hidden" &&
          !isSocialLinkContentUnchanged(existingLink, requestedLink) &&
          compareModeratedUrls(existingLink.url, requestedLink.url) !== "changed"
        ) {
          return NextResponse.json(
            {
              error:
                "非公開前と同じリンクです。別のURLへ変更してください。",
            },
            { status: 409 },
          );
        }
      }
    }

    const savedProfile = await prisma.$transaction(async (transaction) => {
      let profileId: string;

      if (!existingProfile) {
        const createdProfile = await transaction.profile.create({
          data: {
            userId,
            authId: supabaseUser.id,
            displayName: displayName || userId,
            bio,
            audioUrl: "",
            audioKey: "",
            audioTitle: audioTitleToSave,
            theme,
            sns: {
              create: [],
            },
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
          actorId: supabaseUser.id,
        });
        await transaction.profile.update({
          where: { userId },
          data: {
            displayName: displayName || userId,
            bio,
            audioTitle: audioTitleToSave,
            theme,
            ...(profileCorrection
              ? { status: profileCorrection.profileStatus }
              : {}),
          },
          include: { sns: true },
        });
        profileId = existingProfile.id;
      }

      if (preserveExistingLinks) {
        return transaction.profile.findUnique({
          where: { userId },
          include: {
            sns: true,
            moderationCases: ownerModerationCasesQuery,
          },
        });
      }

      const existingLinks = (existingProfile?.sns ?? []).map((link) => ({
        ...link,
        status: link.status ?? ("active" as const),
      }));
      const retainedLinkIds = new Set<string>();

      for (const requestedLink of socialLinksToSave) {
        const existingLink = findRequestedExistingLink(
          existingLinks,
          requestedLink,
        );
        if (!existingLink) {
          await transaction.socialLink.create({
            data: {
              profileId,
              service: requestedLink.service,
              url: requestedLink.url,
              label: requestedLink.label,
              sortOrder: requestedLink.sortOrder,
            },
          });
          continue;
        }

        retainedLinkIds.add(existingLink.id);
        if (
          isSocialLinkContentUnchanged(existingLink, requestedLink) &&
          existingLink.sortOrder === requestedLink.sortOrder
        ) {
          continue;
        }

        let nextStatus = existingLink.status;
        if (!isSocialLinkContentUnchanged(existingLink, requestedLink)) {
          const correction = await recordModeratedLinkCorrection({
            transaction,
            profileId,
            link: existingLink,
            requestedLink,
            actorId: supabaseUser.id,
            deleted: false,
          });
          if (correction) {
            nextStatus = "hidden";
          }
        }

        await transaction.socialLink.update({
          where: { id: existingLink.id },
          data: {
            service: requestedLink.service,
            url: requestedLink.url,
            label: requestedLink.label,
            sortOrder: requestedLink.sortOrder,
            status: nextStatus,
          },
        });
      }

      for (const existingLink of existingLinks) {
        if (retainedLinkIds.has(existingLink.id)) continue;

        await recordModeratedLinkCorrection({
          transaction,
          profileId,
          link: existingLink,
          actorId: supabaseUser.id,
          deleted: true,
        });
        await transaction.socialLink.delete({ where: { id: existingLink.id } });
      }

      return transaction.profile.findUnique({
        where: { userId },
        include: {
          sns: true,
          moderationCases: ownerModerationCasesQuery,
        },
      });
    });

    return NextResponse.json(savedProfile, {
      headers: PRIVATE_NO_STORE_HEADERS,
    });
  } catch (error) {
    console.error("Failed to save profile", error);
    return NextResponse.json(
      { error: "プロフィールの保存に失敗しました。" },
      { status: 500 },
    );
  }
}
