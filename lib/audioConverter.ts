import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";
import fs from "fs/promises";

const execFileAsync = promisify(execFile);

// os.tmpdir()は日本語ユーザー名を含む場合がありFFmpegが失敗するため、
// プロジェクトルート内のASCIIパスのみの一時ディレクトリを使用する
const PROJECT_TMP_DIR = path.join(process.cwd(), ".tmp");

// 変換フォーマット設定
const OUTPUT_EXT = ".m4a";

// Next.jsのバンドラーがffmpeg-staticのパスを書き換えてしまうため、
// importを使わずprocess.cwd()から直接バイナリパスを構築する
function getFfmpegBinaryPath(): string {
  const ffmpegExe = process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
  return path.join(process.cwd(), "node_modules", "ffmpeg-static", ffmpegExe);
}

export interface ConversionOptions {
  inputPath: string;
  outputPath?: string;
  bitrate?: string;
}

/**
 * FFmpegを使用して音声ファイルをAAC形式（.m4a）に変換する
 * child_processを使ってFFmpegを直接実行する
 * @param options 変換オプション
 * @returns 変換後のファイルパス
 */
export async function convertToAac(options: ConversionOptions): Promise<string> {
  const { inputPath, outputPath, bitrate = "128k" } = options;

  // プロジェクト内の.tmpディレクトリを使用（ASCIIパスのみ）
  await fs.mkdir(PROJECT_TMP_DIR, { recursive: true });
  const tempDir = await fs.mkdtemp(path.join(PROJECT_TMP_DIR, "audio-"));
  const finalOutputPath = outputPath || path.join(tempDir, `${Date.now()}${OUTPUT_EXT}`);

  const ffmpegBinary = getFfmpegBinaryPath();

  // バイナリの存在確認
  await fs.access(ffmpegBinary);

  const args = [
    "-i", inputPath,
    "-c:a", "aac",       // FFmpeg内蔵AACエンコーダー（全ブラウザ対応）
    "-b:a", bitrate,
    "-vn",               // ビデオストリームを無視
    "-movflags", "+faststart", // ストリーミング最適化（先頭にメタデータを配置）
    "-y",                // 出力ファイルが存在する場合上書き
    finalOutputPath,
  ];

  try {
    await execFileAsync(ffmpegBinary, args);
    return finalOutputPath;
  } catch (error) {
    // エラー時は一時ディレクトリをクリーンアップ
    await fs.rm(tempDir, { recursive: true, force: true });

    // child_processのエラーにはstderrが含まれるため詳細を付与する
    const errMsg = error instanceof Error
      ? error.message
      : String(error);
    throw new Error(`FFmpeg conversion failed: ${errMsg}`);
  }
}

/**
 * 一時ファイルを削除する
 * @param filePath 削除するファイルパス
 */
export async function cleanupTempFile(filePath: string): Promise<void> {
  try {
    await fs.unlink(filePath);
  } catch (error) {
    console.warn(`Failed to cleanup temp file ${filePath}:`, error);
  }
}
