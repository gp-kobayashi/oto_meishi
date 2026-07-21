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
import { getClientIp } from "@/lib/clientIp";
import {
  consumePrivateProfileReadIpRateLimit,
  consumePrivateProfileReadUserRateLimit,
  consumePublicProfileReadIpRateLimit,
} from "@/lib/profileReadRateLimit";

const MAX_PROFILE_REQUEST_BODY_BYTES = 64 * 1024;

type ProfileRequestBody = Parameters<typeof sanitizeProfileData>[0];

function toProfileRequestBody(value: unknown): ProfileRequestBody {
  return typeof value === "object" && value !== null
    ? (value as ProfileRequestBody)
    : {};
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
        include: { sns: true },
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
        (existingProfile.status ?? "active") !== "active" ||
        (existingProfile.audioStatus ?? "active") !== "active" ||
        existingProfile.sns.some((link) => (link.status ?? "active") !== "active")
      ) {
        return NextResponse.json(
          { error: "管理対応中のため、プロフィールを変更できません。" },
          { status: 403 },
        );
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

      await transaction.socialLink.deleteMany({ where: { profileId } });

      if (socialLinks.length > 0) {
        await transaction.socialLink.createMany({
          data: socialLinks.map((link) => ({
            profileId,
            service: link.service,
            url: link.url,
            label: link.label,
            sortOrder: link.sortOrder,
          })),
        });
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
