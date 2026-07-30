import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deleteFromR2, extractKeyFromUrl } from "@/lib/r2Storage";
import { createServerSupabaseClient } from "@/lib/supabaseClient";
import { PRIVATE_NO_STORE_HEADERS } from "@/lib/httpCache";

export async function DELETE(request: Request) {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json(
      { error: "Unauthorized: Missing or invalid token" },
      { status: 401 },
    );
  }

  const token = authHeader.slice("Bearer ".length);
  const supabaseServer = createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabaseServer.auth.getUser(token);

  if (authError || !user) {
    return NextResponse.json(
      { error: "Unauthorized: Invalid token" },
      { status: 401 },
    );
  }

  const profile = await prisma.profile.findUnique({
    where: { authId: user.id },
    select: { audioUrl: true, audioKey: true, audioStatus: true },
  });

  if (!profile) {
    return NextResponse.json({ error: "profile not found" }, { status: 404 });
  }

  if (!profile.audioKey && !profile.audioUrl) {
    if (profile.audioStatus === "hidden") {
      const recoveryResult = await prisma.profile.updateMany({
        where: {
          authId: user.id,
          audioUrl: "",
          audioKey: "",
          audioStatus: "hidden",
        },
        data: { audioStatus: "removed" },
      });

      if (recoveryResult.count !== 1) {
        return NextResponse.json(
          { error: "音源の状態が更新されているため削除を中止しました。" },
          { status: 409 },
        );
      }
    }

    return NextResponse.json(
      {
        success: true,
        audioUrl: "",
        audioTitle: "",
        audioStatus:
          profile.audioStatus === "hidden" ? "removed" : profile.audioStatus,
      },
      { headers: PRIVATE_NO_STORE_HEADERS },
    );
  }

  const audioKey = profile.audioKey || extractKeyFromUrl(profile.audioUrl);
  if (!audioKey) {
    return NextResponse.json(
      { error: "音源情報が不正なため削除できませんでした。" },
      { status: 500 },
    );
  }

  let updateResult: { count: number };
  try {
    updateResult = await prisma.profile.updateMany({
      where: {
        authId: user.id,
        audioUrl: profile.audioUrl,
        audioKey: profile.audioKey,
        audioStatus: profile.audioStatus,
      },
      data: {
        audioUrl: "",
        audioKey: "",
        audioTitle: "",
        audioStatus:
          profile.audioStatus === "hidden" ? "removed" : profile.audioStatus,
      },
    });
  } catch (error) {
    console.error("Failed to clear profile audio:", error);
    return NextResponse.json(
      { error: "音源情報の更新に失敗しました。" },
      { status: 500 },
    );
  }

  if (updateResult.count !== 1) {
    return NextResponse.json(
      { error: "音源が更新されているため削除を中止しました。" },
      { status: 409 },
    );
  }

  try {
    await deleteFromR2(audioKey);
  } catch (error) {
    console.error("Failed to delete unreferenced audio file from R2:", error);
  }

  return NextResponse.json(
    {
      success: true,
      audioUrl: "",
      audioTitle: "",
      audioStatus:
        profile.audioStatus === "hidden" ? "removed" : profile.audioStatus,
    },
    { headers: PRIVATE_NO_STORE_HEADERS },
  );
}
