import { NextResponse } from "next/server";
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
  getModerationDeadline,
  getPendingStatusForReviewMode,
} from "@/lib/moderationRemediation";
import { getClientIp } from "@/lib/clientIp";
import {
  consumePrivateProfileReadIpRateLimit,
  consumePrivateProfileReadUserRateLimit,
  consumePublicProfileReadIpRateLimit,
} from "@/lib/profileReadRateLimit";

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

type ProfileTransaction = Parameters<
  Parameters<typeof prisma.$transaction>[0]
>[0];

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

async function recordModeratedLinkCorrection({
  transaction,
  profileId,
  link,
  requestedLink,
  actorId,
  deleted,
}: {
  transaction: ProfileTransaction;
  profileId: string;
  link: ExistingSocialLink;
  requestedLink?: ComparableSocialLink;
  actorId: string;
  deleted: boolean;
}) {
  const deadline = getModerationDeadline();
  const existingCase = await transaction.moderationCase.findFirst({
    where: {
      targetType: "socialLink",
      targetId: link.id,
      status: {
        in: ["correctionRequired", "postReviewPending", "preReviewPending"],
      },
    },
    select: { id: true, status: true, reviewMode: true },
  });
  const reviewMode = existingCase?.reviewMode ?? "postReview";
  const pendingStatus = getPendingStatusForReviewMode(reviewMode);
  const moderationCase = existingCase
    ? await transaction.moderationCase.update({
        where: { id: existingCase.id },
        data: {
          status: pendingStatus,
          reviewDueAt: deadline,
          retentionExpiresAt: deadline,
          resolvedAt: null,
        },
        select: { id: true },
      })
    : await transaction.moderationCase.create({
        data: {
          profileId,
          targetType: "socialLink",
          targetId: link.id,
          reasonCode: "unsafeLink",
          reviewMode,
          status: pendingStatus,
          userMessage: "非公開リンクが修正されました。",
          reviewDueAt: deadline,
          retentionExpiresAt: deadline,
        },
        select: { id: true },
      });

  const reportedSnapshot = await transaction.moderationSnapshot.findFirst({
    where: { moderationCaseId: moderationCase.id, kind: "reported" },
    select: { id: true },
  });
  if (!reportedSnapshot) {
    await transaction.moderationSnapshot.create({
      data: {
        moderationCaseId: moderationCase.id,
        kind: "reported",
        content: {
          service: link.service,
          url: link.url,
          label: link.label,
        },
        expiresAt: deadline,
      },
    });
  }

  await transaction.moderationSnapshot.create({
    data: {
      moderationCaseId: moderationCase.id,
      kind: "corrected",
      content: deleted
        ? { deleted: true }
        : {
            service: requestedLink?.service,
            url: requestedLink?.url,
            label: requestedLink?.label,
          },
      expiresAt: deadline,
    },
  });
  await transaction.moderationCaseEvent.create({
    data: {
      moderationCaseId: moderationCase.id,
      eventType: deleted ? "contentDeleted" : "contentChanged",
      actorType: "user",
      actorId,
      previousStatus: existingCase?.status ?? "correctionRequired",
      newStatus: pendingStatus,
      details: { targetType: "socialLink", targetId: link.id },
    },
  });

  return { pendingStatus, reviewMode };
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const userId = url.searchParams.get("userId");
    const mine = url.searchParams.get("mine") === "true";

    if (mine) {
      const authHeader = request.headers.get("Authorization");
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return NextResponse.json(
          { error: "Unauthorized: Missing or invalid token" },
          { status: 401 },
        );
      }

      const token = authHeader.slice("Bearer ".length);
      const supabaseServer = createServerSupabaseClient();
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

      const rateLimit = consumePrivateProfileReadUserRateLimit(user.id);
      if (!rateLimit.allowed) {
        return NextResponse.json(
          {
            error:
              "プロフィール取得の回数が上限に達しました。しばらく待ってから再度お試しください。",
          },
          {
            status: 429,
            headers: {
              ...PRIVATE_NO_STORE_HEADERS,
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
        const ipRateLimit = consumePrivateProfileReadIpRateLimit(clientIp);
        if (!ipRateLimit.allowed) {
          return NextResponse.json(
            {
              error:
                "この接続元からのプロフィール取得が集中しています。しばらく待ってから再度お試しください。",
            },
            {
              status: 429,
              headers: {
                ...PRIVATE_NO_STORE_HEADERS,
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

      const profile = await prisma.profile.findUnique({
        where: { authId: user.id },
        include: {
          sns: true,
          moderationCases: {
            where: {
              status: {
                in: [
                  "correctionRequired",
                  "postReviewPending",
                  "preReviewPending",
                ],
              },
            },
            select: {
              id: true,
              targetType: true,
              targetId: true,
              reasonCode: true,
              reviewMode: true,
              status: true,
              userMessage: true,
              reviewDueAt: true,
            },
            orderBy: { updatedAt: "desc" },
          },
        },
      });

      if (!profile) {
        return NextResponse.json(
          { error: "profile not found" },
          { status: 404 },
        );
      }

      return NextResponse.json(profile, {
        headers: PRIVATE_NO_STORE_HEADERS,
      });
    }

    if (!userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }

    const clientIp = getClientIp(request.headers);
    if (clientIp) {
      const rateLimit = consumePublicProfileReadIpRateLimit(clientIp);
      if (!rateLimit.allowed) {
        return NextResponse.json(
          {
            error:
              "プロフィールの閲覧が集中しています。しばらく待ってから再度お試しください。",
          },
          {
            status: 429,
            headers: {
              ...PRIVATE_NO_STORE_HEADERS,
              "Retry-After": String(rateLimit.retryAfterSeconds),
              "X-RateLimit-Limit": String(rateLimit.limit),
              "X-RateLimit-Remaining": String(rateLimit.remaining),
              "X-RateLimit-Reset": String(Math.ceil(rateLimit.resetAt / 1000)),
            },
          },
        );
      }
    }

    const profile = await prisma.profile.findUnique({
      where: { userId },
      include: { sns: true },
    });

    if (!profile || (profile.status ?? "active") !== "active") {
      return NextResponse.json({ error: "profile not found" }, { status: 404 });
    }

    const hasAudio =
      (profile.audioStatus ?? "active") === "active" &&
      Boolean(profile.audioKey || profile.audioUrl);
    const publicProfile = {
      id: profile.id,
      userId: profile.userId,
      theme: profile.theme,
      displayName: profile.displayName,
      bio: profile.bio,
      audioUrl: "",
      hasAudio,
      audioTitle: hasAudio ? profile.audioTitle : "",
      sns: profile.sns
        .filter((link) => (link.status ?? "active") === "active")
        .map(({ service, url, label }) => ({ service, url, label })),
    };

    return NextResponse.json(publicProfile);
  } catch (error) {
    console.error("Failed to get profile", error);
    return NextResponse.json(
      { error: "プロフィールの取得に失敗しました。" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
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

    let supabaseUser: { id: string } | null = null;
    try {
      const supabaseServer = createServerSupabaseClient();
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

    const { data: profileInput, error: validationError } = sanitizeProfileData(
      toProfileRequestBody(jsonBody.value),
    );

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
      include: { sns: true },
    });
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

    } else {
      // 未紐付けプロフィールをリクエストだけで取得できないよう、所有者の完全一致を必須にする
      if (existingProfile.authId !== supabaseUser.id) {
        return NextResponse.json(
          { error: "別のユーザーのプロフィールを変更する権限がありません。" },
          { status: 403 },
        );
      }


      if (
        (existingProfile.accountModerationStatus ?? "active") !== "active" ||
        existingProfile.status === "suspended"
      ) {
        return NextResponse.json(
          { error: "アカウント利用停止中のため、プロフィールを変更できません。" },
          { status: 403 },
        );
      }

      preserveExistingLinks = areSocialLinksUnchanged(
        existingProfile.sns,
        socialLinks,
      );
      const existingLinks = existingProfile.sns.map((link) => ({
        ...link,
        status: link.status ?? ("active" as const),
      }));
      for (const requestedLink of socialLinks) {
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
            audioTitle,
            theme,
            sns: {
              create: [],
            },
          },
          include: { sns: true },
        });
        profileId = createdProfile.id;
      } else {
        await transaction.profile.update({
          where: { userId },
          data: {
            displayName: displayName || userId,
            bio,
            audioTitle,
            theme,
          },
          include: { sns: true },
        });
        profileId = existingProfile.id;
      }

      if (preserveExistingLinks) {
        return transaction.profile.findUnique({
          where: { userId },
          include: { sns: true },
        });
      }

      const existingLinks = (existingProfile?.sns ?? []).map((link) => ({
        ...link,
        status: link.status ?? ("active" as const),
      }));
      const retainedLinkIds = new Set<string>();

      for (const requestedLink of socialLinks) {
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
        if (
          existingLink.status === "hidden" &&
          !isSocialLinkContentUnchanged(existingLink, requestedLink)
        ) {
          const correction = await recordModeratedLinkCorrection({
            transaction,
            profileId,
            link: existingLink,
            requestedLink,
            actorId: supabaseUser.id,
            deleted: false,
          });
          nextStatus =
            correction.reviewMode === "postReview" ? "active" : "hidden";
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

        if (existingLink.status === "hidden") {
          await recordModeratedLinkCorrection({
            transaction,
            profileId,
            link: existingLink,
            actorId: supabaseUser.id,
            deleted: true,
          });
        }
        await transaction.socialLink.delete({ where: { id: existingLink.id } });
      }

      return transaction.profile.findUnique({
        where: { userId },
        include: { sns: true },
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
