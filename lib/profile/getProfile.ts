import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createServerSupabaseClient } from "@/lib/supabaseClient";
import { PRIVATE_NO_STORE_HEADERS } from "@/lib/httpCache";
import { getClientIp } from "@/lib/clientIp";
import {
  consumePrivateProfileReadIpRateLimit,
  consumePrivateProfileReadUserRateLimit,
  consumePublicProfileReadIpRateLimit,
} from "@/lib/profileReadRateLimit";
import { ownerModerationCasesQuery } from "./queries";

export async function getProfile(request: Request) {
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
                "X-RateLimit-Reset": String(Math.ceil(ipRateLimit.resetAt / 1000)),
              },
            },
          );
        }
      }
      const profile = await prisma.profile.findUnique({
        where: { authId: user.id },
        include: { sns: true, moderationCases: ownerModerationCasesQuery },
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
    if (
      !profile ||
      (profile.status ?? "active") !== "active" ||
      (profile.accountModerationStatus ?? "active") !== "active"
    ) {
      return NextResponse.json({ error: "profile not found" }, { status: 404 });
    }
    const hasAudio =
      (profile.audioStatus ?? "active") === "active" &&
      Boolean(profile.audioKey || profile.audioUrl);
    return NextResponse.json({
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
    });
  } catch (error) {
    console.error("Failed to get profile", error);
    return NextResponse.json(
      { error: "プロフィールの取得に失敗しました。" },
      { status: 500 },
    );
  }
}
