import { NextRequest, NextResponse } from "next/server";
import { convertToAac, cleanupTempFile } from "../../../../lib/audioConverter";
import { uploadToR2, generateAudioKey } from "../../../../lib/r2Storage";
import path from "path";
import fs from "fs/promises";

// os.tmpdir()は日本語ユーザー名を含む場合がありFFmpegが失敗するため、
// プロジェクトルート内のASCIIパスのみの一時ディレクトリを使用する
const PROJECT_TMP_DIR = path.join(process.cwd(), ".tmp");

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;
    const userId = formData.get("userId") as string;

    if (!file) {
      return NextResponse.json({ error: "File is required" }, { status: 400 });
    }

    if (!userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }

    // 一時ディレクトリを作成（ASCIIパスのみのプロジェクト内ディレクトリを使用）
    await fs.mkdir(PROJECT_TMP_DIR, { recursive: true });
    const tempDir = await fs.mkdtemp(path.join(PROJECT_TMP_DIR, "upload-"));
    // ファイル名に日本語等が含まれる場合もFFmpegが失敗するため、拡張子のみ保持したASCII安全なファイル名を使用する
    const safeFileName = `input${path.extname(file.name)}`;
    const inputPath = path.join(tempDir, safeFileName);

    // アップロードされたファイルを一時ファイルとして保存
    const buffer = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(inputPath, buffer);

    try {
      // FFmpegでAAC形式（.m4a）に変換（128kbps・全ブラウザ対応）
      const convertedPath = await convertToAac({
        inputPath,
        bitrate: "128k",
      });

      try {
        // R2ストレージにアップロード
        const audioKey = generateAudioKey(userId, file.name);
        const audioUrl = await uploadToR2(convertedPath, audioKey, "audio/mp4");

        console.log("Audio uploaded successfully:", { audioKey, audioUrl });

        // 一時ファイルをクリーンアップ
        await cleanupTempFile(inputPath);
        await cleanupTempFile(convertedPath);
        await fs.rm(tempDir, { recursive: true, force: true });

        return NextResponse.json({
          success: true,
          audioUrl,
          audioKey,
        });
      } catch (uploadError) {
        // アップロード失敗時は変換ファイルをクリーンアップ
        await cleanupTempFile(convertedPath);
        throw uploadError;
      }
    } catch (conversionError) {
      // 変換失敗時は入力ファイルをクリーンアップ
      await cleanupTempFile(inputPath);
      await fs.rm(tempDir, { recursive: true, force: true });
      throw conversionError;
    }
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown server error",
      },
      { status: 500 },
    );
  }
}
