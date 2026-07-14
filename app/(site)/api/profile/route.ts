import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deleteFromR2, extractKeyFromUrl } from "@/lib/r2Storage";
import type { ProfileData, SocialLink, SocialService } from "@/lib/mock/profileData";
import { createServerSupabaseClient } from "@/lib/supabaseClient";

const allowedThemes = ["normal", "dark", "light", "colorful"] as const;
const allowedServices: SocialService[] = [
  "x",
  "instagram",
  "youtube",
  "tiktok",
  "github",
  "discord",
  "facebook",
  "linkedin",
  "bluesky",
  "threads",
  "note",
  "website",
  "other",
];

// 文字数制限
const MAX_DISPLAY_NAME_LENGTH = 20;
const MAX_BIO_LENGTH = 60;
const MAX_AUDIO_TITLE_LENGTH = 25;
const MAX_SOCIAL_LABEL_LENGTH = 25;

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const userId = url.searchParams.get("userId");

    if (!userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }

    const profile = await prisma.profile.findUnique({
      where: { userId },
      include: { sns: true },
    });

    if (!profile) {
      return NextResponse.json({ error: "profile not found" }, { status: 404 });
    }

    console.log("Profile fetched:", { userId, audioUrl: profile.audioUrl });

    return NextResponse.json(profile);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown server error" },
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

    const body = (await request.json().catch(() => ({}))) as Partial<ProfileData> & {
      userId?: string;
      sns?: SocialLink[];
    };
    const userId = typeof body.userId === "string" ? body.userId.trim() : "";
    const displayName =
      typeof body.displayName === "string" ? body.displayName.trim() : userId;
    const theme =
      typeof body.theme === "string" && allowedThemes.includes(body.theme as (typeof allowedThemes)[number])
        ? body.theme
        : "normal";
    const bio = typeof body.bio === "string" ? body.bio : "";
    const audioUrl = typeof body.audioUrl === "string" ? body.audioUrl : "";
    const audioTitle = typeof body.audioTitle === "string" ? body.audioTitle : "";

    if (!userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(userId)) {
      return NextResponse.json(
        { error: "userId must only contain letters, numbers, hyphen, and underscore." },
        { status: 400 },
      );
    }

    // 文字数制限チェック
    if (displayName.length > MAX_DISPLAY_NAME_LENGTH) {
      return NextResponse.json(
        { error: `表示名は${MAX_DISPLAY_NAME_LENGTH}文字までです。` },
        { status: 400 },
      );
    }

    if (bio.length > MAX_BIO_LENGTH) {
      return NextResponse.json(
        { error: `自己紹介は${MAX_BIO_LENGTH}文字までです。` },
        { status: 400 },
      );
    }

    if (audioTitle.length > MAX_AUDIO_TITLE_LENGTH) {
      return NextResponse.json(
        { error: `音声タイトルは${MAX_AUDIO_TITLE_LENGTH}文字までです。` },
        { status: 400 },
      );
    }

    const snsPayload = (Array.isArray(body.sns) ? body.sns : [])
      .filter(
        (link): link is SocialLink =>
          typeof link === "object" &&
          link !== null &&
          typeof link.url === "string" &&
          typeof link.label === "string" &&
          typeof link.service === "string",
      )
      .map((link, index) => ({
        service: allowedServices.includes(link.service as SocialService)
          ? (link.service as SocialService)
          : "other",
        url: link.url,
        label: link.label,
        sortOrder: index,
      }));

    // SNSラベルの文字数制限チェック
    for (const link of snsPayload) {
      if (link.label.length > MAX_SOCIAL_LABEL_LENGTH) {
        return NextResponse.json(
          { error: `SNSラベルは${MAX_SOCIAL_LABEL_LENGTH}文字までです。` },
          { status: 400 },
        );
      }
    }

    let profile = await prisma.profile.findUnique({
      where: { userId },
      include: { sns: true },
    });

    if (!profile) {
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

      profile = await prisma.profile.create({
        data: {
          userId,
          authId: supabaseUser.id,
          displayName: displayName || userId,
          bio,
          audioUrl,
          audioTitle,
          theme,
          sns: {
            create: [],
          },
        },
        include: { sns: true },
      });
    } else {
      // 既存プロフィールの更新時：authIdの一致確認、または既存で設定されていない場合はここで紐付け
      if (profile.authId && profile.authId !== supabaseUser.id) {
        return NextResponse.json(
          { error: "別のユーザーのプロフィールを変更する権限がありません。" },
          { status: 403 },
        );
      }

      // audioUrlが変更された場合、古い音源をR2から削除
      if (profile.audioUrl && profile.audioUrl !== audioUrl) {
        try {
          const oldKey = extractKeyFromUrl(profile.audioUrl);
          await deleteFromR2(oldKey);
          console.log("Deleted old audio file from R2:", oldKey);
        } catch (error) {
          console.error("Failed to delete old audio file:", error);
          // 削除に失敗してもプロフィール更新は続行
        }
      }

      profile = await prisma.profile.update({
        where: { userId },
        data: {
          authId: profile.authId ? undefined : supabaseUser.id,
          displayName: displayName || userId,
          bio,
          audioUrl,
          audioTitle,
          theme,
        },
        include: { sns: true },
      });
    }

    await prisma.socialLink.deleteMany({ where: { profileId: profile.id } });

    if (snsPayload.length > 0) {
      await prisma.socialLink.createMany({
        data: snsPayload.map((link) => ({
          profileId: profile.id,
          service: link.service,
          url: link.url,
          label: link.label,
          sortOrder: link.sortOrder,
        })),
      });
    }

    const savedProfile = await prisma.profile.findUnique({
      where: { userId },
      include: { sns: true },
    });

    return NextResponse.json(savedProfile);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown server error" },
      { status: 500 },
    );
  }
}
