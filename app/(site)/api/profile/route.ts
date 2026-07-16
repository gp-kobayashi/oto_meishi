import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deleteFromR2, extractKeyFromUrl } from "@/lib/r2Storage";
import { createServerSupabaseClient } from "@/lib/supabaseClient";
import { sanitizeProfileData } from "@/lib/apiValidation";

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

      return NextResponse.json(profile);
    }

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

    const rawRequestBody = await request.json().catch(() => ({}));
    const { data: profileInput, error: validationError } = sanitizeProfileData(
      toProfileRequestBody(rawRequestBody),
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
      audioUrl,
      audioTitle,
      theme,
      sns: socialLinks,
    } = profileInput;

    const existingProfile = await prisma.profile.findUnique({
      where: { userId },
      include: { sns: true },
    });
    let profileId: string;

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

      const createdProfile = await prisma.profile.create({
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
      profileId = createdProfile.id;
    } else {
      // 既存プロフィールの更新時：authIdの一致確認、または既存で設定されていない場合はここで紐付け
      if (
        existingProfile.authId &&
        existingProfile.authId !== supabaseUser.id
      ) {
        return NextResponse.json(
          { error: "別のユーザーのプロフィールを変更する権限がありません。" },
          { status: 403 },
        );
      }

      // audioUrlが変更された場合、古い音源をR2から削除
      if (
        existingProfile.audioUrl &&
        existingProfile.audioUrl !== audioUrl
      ) {
        try {
          const oldKey = extractKeyFromUrl(existingProfile.audioUrl);
          await deleteFromR2(oldKey);
          console.log("Deleted old audio file from R2:", oldKey);
        } catch (error) {
          console.error("Failed to delete old audio file:", error);
          // 削除に失敗してもプロフィール更新は続行
        }
      }

      await prisma.profile.update({
        where: { userId },
        data: {
          authId: existingProfile.authId ? undefined : supabaseUser.id,
          displayName: displayName || userId,
          bio,
          audioUrl,
          audioTitle,
          theme,
        },
        include: { sns: true },
      });
      profileId = existingProfile.id;
    }

    await prisma.socialLink.deleteMany({ where: { profileId } });

    if (socialLinks.length > 0) {
      await prisma.socialLink.createMany({
        data: socialLinks.map((link) => ({
          profileId,
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
