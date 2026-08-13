import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
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
import { executeProfileSave } from "@/lib/profile/profileSaveCommand";
import { prepareProfileSave } from "@/lib/profile/profileSavePreparation";

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

    const preparation = await prepareProfileSave({
      profileInput,
      hasAudioTitleInput,
      hasSocialLinksInput,
      supabaseUser,
      supabaseServer,
    });
    if (!preparation.ok) {
      return NextResponse.json(
        { error: preparation.error },
        { status: preparation.status, headers: preparation.headers },
      );
    }

    const savedProfile = await executeProfileSave({
      existingProfile: preparation.existingProfile,
      userId: profileInput.userId,
      authId: supabaseUser.id,
      displayName: profileInput.displayName,
      bio: profileInput.bio,
      audioTitle: preparation.audioTitle,
      theme: profileInput.theme,
      socialLinks: preparation.socialLinks,
      preserveExistingLinks: preparation.preserveExistingLinks,
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
