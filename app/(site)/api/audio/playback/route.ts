import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createSignedAudioUrl, extractKeyFromUrl } from "@/lib/r2Storage";
import { getClientIp } from "@/lib/clientIp";
import { consumePublicPlaybackIpRateLimit } from "@/lib/audioPlaybackRateLimit";

const PLAYBACK_URL_EXPIRY_SECONDS = 300;

export async function GET(request: Request) {
  const userId = new URL(request.url).searchParams.get("userId")?.trim();

  if (!userId || !/^[a-zA-Z0-9_-]+$/.test(userId)) {
    return NextResponse.json({ error: "Invalid userId." }, { status: 400 });
  }

  const clientIp = getClientIp(request.headers);
  if (clientIp) {
    const rateLimit = consumePublicPlaybackIpRateLimit(clientIp);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          error:
            "音声の再生リクエストが集中しています。しばらく待ってから再度お試しください。",
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
  }

  const profile = await prisma.profile.findUnique({
    where: { userId },
    select: {
      status: true,
      accountModerationStatus: true,
      audioStatus: true,
      audioKey: true,
      audioUrl: true,
    },
  });

  if (
    !profile ||
    profile.status !== "active" ||
    profile.accountModerationStatus !== "active" ||
    profile.audioStatus !== "active" ||
    (!profile.audioKey && !profile.audioUrl)
  ) {
    return NextResponse.json({ error: "Audio not found." }, { status: 404 });
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
    console.error("Failed to create audio playback URL", error);
    return NextResponse.json(
      { error: "音声の再生URLを発行できませんでした。" },
      { status: 500 },
    );
  }
}
