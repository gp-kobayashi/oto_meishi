import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createSignedAudioUrl, extractKeyFromUrl } from "@/lib/r2Storage";

const PLAYBACK_URL_EXPIRY_SECONDS = 300;

export async function GET(request: Request) {
  const userId = new URL(request.url).searchParams.get("userId")?.trim();

  if (!userId || !/^[a-zA-Z0-9_-]+$/.test(userId)) {
    return NextResponse.json({ error: "Invalid userId." }, { status: 400 });
  }

  const profile = await prisma.profile.findUnique({
    where: { userId },
    select: {
      status: true,
      audioStatus: true,
      audioKey: true,
      audioUrl: true,
    },
  });

  if (
    !profile ||
    profile.status !== "active" ||
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
