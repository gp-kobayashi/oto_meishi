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
const MAX_OUTPUT_DURATION_SECONDS = 180;
const MAX_OUTPUT_SIZE_BYTES = 5 * 1024 * 1024;
const CONVERSION_TIMEOUT_MS = 60_000;
const PROCESS_OUTPUT_MAX_BUFFER_BYTES = 1024 * 1024;

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
  audioStreamIndex: number;
  outputSampleRate: number;
  outputChannels: 1 | 2;
}

interface FfmpegArgumentsOptions {
  inputPath: string;
  outputPath: string;
  bitrate: string;
  audioStreamIndex: number;
  outputSampleRate: number;
  outputChannels: 1 | 2;
}

export function buildFfmpegArguments(
  options: FfmpegArgumentsOptions,
): string[] {
  const {
    inputPath,
    outputPath,
    bitrate,
    audioStreamIndex,
    outputSampleRate,
    outputChannels,
  } = options;

  return [
    "-hide_banner",
    "-nostdin",
    "-i", inputPath,
    "-map", `0:${audioStreamIndex}`,
    "-c:a", "aac",
    "-profile:a", "aac_low",
    "-b:a", bitrate,
    "-ar", String(outputSampleRate),
    "-ac", String(outputChannels),
    "-vn",
    "-sn",
    "-dn",
    "-t", String(MAX_OUTPUT_DURATION_SECONDS),
    "-fs", String(MAX_OUTPUT_SIZE_BYTES),
    "-threads", "1",
    "-movflags", "+faststart",
    "-y",
    outputPath,
  ];
}

/**
 * FFmpegを使用して音声ファイルをAAC形式（.m4a）に変換する
 * child_processを使ってFFmpegを直接実行する
 * @param options 変換オプション
 * @returns 変換後のファイルパス
 */
export async function convertToAac(options: ConversionOptions): Promise<string> {
  const {
    inputPath,
    outputPath,
    bitrate = "128k",
    audioStreamIndex,
    outputSampleRate,
    outputChannels,
  } = options;

  let ownedTempDir: string | null = null;
  let finalOutputPath = outputPath;

  if (!finalOutputPath) {
    // 呼び出し側から出力先が指定されない場合のみ一時ディレクトリを作成する
    await fs.mkdir(PROJECT_TMP_DIR, { recursive: true });
    ownedTempDir = await fs.mkdtemp(path.join(PROJECT_TMP_DIR, "audio-"));
    finalOutputPath = path.join(ownedTempDir, `${Date.now()}${OUTPUT_EXT}`);
  }

  const ffmpegBinary = getFfmpegBinaryPath();

  // バイナリの存在確認
  await fs.access(ffmpegBinary);

  const args = buildFfmpegArguments({
    inputPath,
    outputPath: finalOutputPath,
    bitrate,
    audioStreamIndex,
    outputSampleRate,
    outputChannels,
  });

  try {
    await execFileAsync(ffmpegBinary, args, {
      timeout: CONVERSION_TIMEOUT_MS,
      maxBuffer: PROCESS_OUTPUT_MAX_BUFFER_BYTES,
      windowsHide: true,
    });
    return finalOutputPath;
  } catch (error) {
    // この関数内で作成した一時ディレクトリだけをクリーンアップする
    if (ownedTempDir) {
      await fs.rm(ownedTempDir, { recursive: true, force: true });
    }

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
