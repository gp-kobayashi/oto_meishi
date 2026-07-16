import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deleteFromR2, extractKeyFromUrl } from "@/lib/r2Storage";
import { createServerSupabaseClient } from "@/lib/supabaseClient";

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
    select: { audioUrl: true },
  });

  if (!profile) {
    return NextResponse.json({ error: "profile not found" }, { status: 404 });
  }

  if (!profile.audioUrl) {
    return NextResponse.json({ success: true, audioUrl: "", audioTitle: "" });
  }

  try {
    const audioKey = extractKeyFromUrl(profile.audioUrl);
    if (!audioKey) {
      throw new Error("Audio object key is empty.");
    }
    await deleteFromR2(audioKey);
  } catch (error) {
    console.error("Failed to delete audio file from R2:", error);
    return NextResponse.json(
      { error: "音源ファイルの削除に失敗しました。" },
      { status: 500 },
    );
  }

  const updatedProfile = await prisma.profile.update({
    where: { authId: user.id },
    data: { audioUrl: "", audioTitle: "" },
  });

  return NextResponse.json({
    success: true,
    audioUrl: updatedProfile.audioUrl,
    audioTitle: updatedProfile.audioTitle,
  });
}
