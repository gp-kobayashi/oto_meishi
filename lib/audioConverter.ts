import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";
import fs from "fs/promises";
import { getFfmpegBinaryPath } from "@/lib/ffmpegBinary";
import {
  LOUDNESS_TARGET_INTEGRATED_LUFS,
  LOUDNESS_TARGET_RANGE_LU,
  LOUDNESS_TARGET_TRUE_PEAK_DBTP,
  type LoudnessMeasurement,
  measureAudioLoudness,
} from "@/lib/audioLoudness";

const execFileAsync = promisify(execFile);

// os.tmpdir()は日本語ユーザー名を含む場合がありFFmpegが失敗するため、
// プロジェクトルート内のASCIIパスのみの一時ディレクトリを使用する
const PROJECT_TMP_DIR = path.join(process.cwd(), ".tmp");

// 変換フォーマット設定
const OUTPUT_EXT = ".m4a";
const MAX_OUTPUT_DURATION_SECONDS = 180;
export const MAX_CONVERTED_AUDIO_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const CONVERSION_TIMEOUT_MS = 60_000;
const PROCESS_OUTPUT_MAX_BUFFER_BYTES = 1024 * 1024;

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
  loudnessMeasurement: LoudnessMeasurement;
}

export function buildLoudnessNormalizationFilter(
  measurement: LoudnessMeasurement,
  outputSampleRate: number,
): string {
  const loudnorm = [
    `I=${LOUDNESS_TARGET_INTEGRATED_LUFS}`,
    `TP=${LOUDNESS_TARGET_TRUE_PEAK_DBTP}`,
    `LRA=${LOUDNESS_TARGET_RANGE_LU}`,
    `measured_I=${measurement.inputIntegratedLufs}`,
    `measured_TP=${measurement.inputTruePeakDbtp}`,
    `measured_LRA=${measurement.inputLoudnessRangeLu}`,
    `measured_thresh=${measurement.inputThresholdLufs}`,
    `offset=${measurement.targetOffsetLu}`,
    "linear=true",
    "print_format=summary",
  ].join(":");

  return `loudnorm=${loudnorm},aresample=${outputSampleRate}`;
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
    loudnessMeasurement,
  } = options;

  return [
    "-hide_banner",
    "-nostdin",
    "-i", inputPath,
    "-map", `0:${audioStreamIndex}`,
    "-af", buildLoudnessNormalizationFilter(
      loudnessMeasurement,
      outputSampleRate,
    ),
    "-c:a", "aac",
    "-profile:a", "aac_low",
    "-b:a", bitrate,
    "-ar", String(outputSampleRate),
    "-ac", String(outputChannels),
    "-vn",
    "-sn",
    "-dn",
    "-t", String(MAX_OUTPUT_DURATION_SECONDS),
    "-fs", String(MAX_CONVERTED_AUDIO_FILE_SIZE_BYTES),
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

  try {
    // バイナリの存在確認
    await fs.access(ffmpegBinary);

    // 1パス目で入力音声のラウドネスを測定する
    const loudnessMeasurement = await measureAudioLoudness(
      inputPath,
      audioStreamIndex,
    );

    // 2パス目で測定値を使ってラウドネスを正規化し、AACへ変換する
    const args = buildFfmpegArguments({
      inputPath,
      outputPath: finalOutputPath,
      bitrate,
      audioStreamIndex,
      outputSampleRate,
      outputChannels,
      loudnessMeasurement,
    });

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
