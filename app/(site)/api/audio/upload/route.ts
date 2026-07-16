import { NextRequest, NextResponse } from "next/server";
import { convertToAac } from "@/lib/audioConverter";
import { uploadToR2, generateAudioKey } from "@/lib/r2Storage";
import path from "path";
import fs from "fs/promises";
import { createServerSupabaseClient } from "@/lib/supabaseClient";
import { prisma } from "@/lib/prisma";
import { inspectAudioFile } from "@/lib/audioInspector";
import { validateAudioMetadata } from "@/lib/audioUploadPolicy";

// os.tmpdir()は日本語ユーザー名を含む場合がありFFmpegが失敗するため、
// プロジェクトルート内のASCIIパスのみの一時ディレクトリを使用する
const PROJECT_TMP_DIR = path.join(process.cwd(), ".tmp");
const MAX_AUDIO_FILE_SIZE_BYTES = 64 * 1024 * 1024;

export async function POST(request: NextRequest) {
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

    let authenticatedUserId: string;
    try {
      const supabaseServer = createServerSupabaseClient();
      const { data: { user }, error } = await supabaseServer.auth.getUser(token);
      if (error || !user) {
        return NextResponse.json(
          { error: "Unauthorized: Invalid token" },
          { status: 401 },
        );
      }
      authenticatedUserId = user.id;
    } catch {
      return NextResponse.json(
        { error: "Unauthorized: Token verification failed" },
        { status: 401 },
      );
    }

    const formData = await request.formData();
    const file = formData.get("file");
    const userId = formData.get("userId");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "File is required" }, { status: 400 });
    }

    if (file.size === 0) {
      return NextResponse.json(
        { error: "空の音声ファイルはアップロードできません。" },
        { status: 400 },
      );
    }

    if (file.size > MAX_AUDIO_FILE_SIZE_BYTES) {
      return NextResponse.json(
        { error: "音声ファイルは64MB以下にしてください。" },
        { status: 413 },
      );
    }

    if (typeof userId !== "string" || !userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }

    const profile = await prisma.profile.findUnique({
      where: { userId },
      select: { authId: true },
    });

    if (!profile) {
      return NextResponse.json({ error: "profile not found" }, { status: 404 });
    }

    if (profile.authId !== authenticatedUserId) {
      return NextResponse.json(
        { error: "このプロフィールに音声をアップロードする権限がありません。" },
        { status: 403 },
      );
    }

    let tempDir: string | null = null;
    try {
      // 一時ディレクトリを作成（ASCIIパスのみのプロジェクト内ディレクトリを使用）
      await fs.mkdir(PROJECT_TMP_DIR, { recursive: true });
      tempDir = await fs.mkdtemp(path.join(PROJECT_TMP_DIR, "upload-"));

      // クライアント提供のファイル名をパスに使用せず、固定名で保存する
      const inputPath = path.join(tempDir, "input.bin");
      const outputPath = path.join(tempDir, "output.m4a");

      // アップロードされたファイルを一時ファイルとして保存
      const buffer = Buffer.from(await file.arrayBuffer());
      await fs.writeFile(inputPath, buffer);

      const metadata = await inspectAudioFile(inputPath);
      const policyResult = validateAudioMetadata(metadata);

      if (!policyResult.valid) {
        return NextResponse.json(
          { error: policyResult.message, code: policyResult.code },
          { status: 422 },
        );
      }

      // FFmpegでAAC形式（.m4a）に変換（128kbps・全ブラウザ対応）
      const convertedPath = await convertToAac({
        inputPath,
        outputPath,
        bitrate: "128k",
        audioStreamIndex: policyResult.audioStreamIndex,
        outputSampleRate: policyResult.outputSampleRate,
        outputChannels: policyResult.outputChannels,
      });

      // R2ストレージにアップロード
      const audioKey = generateAudioKey(userId);
      const audioUrl = await uploadToR2(convertedPath, audioKey, "audio/mp4");

      console.log("Audio uploaded successfully:", { audioKey, audioUrl });

      return NextResponse.json({
        success: true,
        audioUrl,
        audioKey,
      });
    } finally {
      if (tempDir) {
        try {
          await fs.rm(tempDir, { recursive: true, force: true });
        } catch (cleanupError) {
          console.error("Failed to cleanup audio upload directory:", cleanupError);
        }
      }
    }
  } catch (error) {
    console.error("Audio upload failed:", error);
    return NextResponse.json(
      { error: "音声アップロードの処理中にエラーが発生しました。" },
      { status: 500 },
    );
  }
}
