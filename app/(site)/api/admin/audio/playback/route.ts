import { NextResponse } from "next/server";
import { authorizeAdminRequest } from "@/lib/adminAuth";
import { prisma } from "@/lib/prisma";
import { createSignedAudioUrl, extractKeyFromUrl } from "@/lib/r2Storage";
import {
  consumeAdminPlaybackIpRateLimit,
  consumeAdminPlaybackRateLimit,
} from "@/lib/audioPlaybackRateLimit";
import { getClientIp } from "@/lib/clientIp";

const PLAYBACK_URL_EXPIRY_SECONDS = 300;

export async function GET(request: Request) {
  const authorization = await authorizeAdminRequest(request);
  if (!authorization.ok) return authorization.response;

  const rateLimit = consumeAdminPlaybackRateLimit(authorization.admin.id);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        error:
          "管理者向け音声の再生リクエストが集中しています。しばらく待ってから再度お試しください。",
      },
      {
        status: 429,
        headers: {
          "Cache-Control": "private, no-store",
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
    const ipRateLimit = consumeAdminPlaybackIpRateLimit(clientIp);
    if (!ipRateLimit.allowed) {
      return NextResponse.json(
        {
          error:
            "この接続元からの管理者向け音声再生が集中しています。しばらく待ってから再度お試しください。",
        },
        {
          status: 429,
          headers: {
            "Cache-Control": "private, no-store",
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

  const profileId = new URL(request.url).searchParams.get("profileId")?.trim();
  if (!profileId || profileId.length > 100) {
    return NextResponse.json(
      { error: "プロフィールIDが不正です。" },
      { status: 400 },
    );
  }

  const profile = await prisma.profile.findUnique({
    where: { id: profileId },
    select: { audioKey: true, audioUrl: true },
  });

  if (!profile || (!profile.audioKey && !profile.audioUrl)) {
    return NextResponse.json({ error: "音声が見つかりません。" }, { status: 404 });
  }

  try {
    const audioKey = profile.audioKey || extractKeyFromUrl(profile.audioUrl);
    const audioUrl = await createSignedAudioUrl(
      audioKey,
      PLAYBACK_URL_EXPIRY_SECONDS,
    );

    return NextResponse.json(
      { audioUrl },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    console.error("Failed to create admin audio playback URL", error);
    return NextResponse.json(
      { error: "音声の再生URLを発行できませんでした。" },
      { status: 500 },
    );
  }
}
