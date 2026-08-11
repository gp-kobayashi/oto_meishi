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
  areSocialLinksUnchanged,
  validateSocialLinks,
} from "@/lib/profile/profileLinks";
import { getClientIp } from "@/lib/clientIp";
import { isRegistrationBanned } from "@/lib/registrationBan";
import { executeProfileSave } from "@/lib/profile/profileSaveCommand";

const MAX_PROFILE_REQUEST_BODY_BYTES = 64 * 1024;

type ProfileRequestBody = Parameters<typeof sanitizeProfileData>[0];

function toProfileRequestBody(value: unknown): ProfileRequestBody {
  return typeof value === "object" && value !== null
    ? (value as ProfileRequestBody)
    : {};
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
      const {
        data: { user },
        error,
      } = await supabaseServer.auth.getUser(token);
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

    const jsonBody = await readJsonBody(
      request,
      MAX_PROFILE_REQUEST_BODY_BYTES,
    );
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
      const linkValidation = await validateSocialLinks(
        existingLinks,
        socialLinksToSave,
        existingProfile.moderationCases ?? [],
      );
      if (!linkValidation.ok) {
        return NextResponse.json(
          { error: linkValidation.error },
          { status: linkValidation.status },
        );
      }
    }

    const savedProfile = await executeProfileSave({
      existingProfile,
      userId,
      authId: supabaseUser.id,
      displayName,
      bio,
      audioTitle: audioTitleToSave,
      theme,
      socialLinks: socialLinksToSave,
      preserveExistingLinks,
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
