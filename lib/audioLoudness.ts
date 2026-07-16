import { execFile } from "child_process";
import { promisify } from "util";
import { getFfmpegBinaryPath } from "@/lib/ffmpegBinary";

const execFileAsync = promisify(execFile);

export const LOUDNESS_TARGET_INTEGRATED_LUFS = -16;
export const LOUDNESS_TARGET_TRUE_PEAK_DBTP = -1.5;
export const LOUDNESS_TARGET_RANGE_LU = 11;

const LOUDNESS_ANALYSIS_TIMEOUT_MS = 60_000;
const PROCESS_OUTPUT_MAX_BUFFER_BYTES = 1024 * 1024;

export interface LoudnessMeasurement {
  inputIntegratedLufs: number;
  inputTruePeakDbtp: number;
  inputLoudnessRangeLu: number;
  inputThresholdLufs: number;
  targetOffsetLu: number;
}

interface LoudnormJson {
  input_i?: unknown;
  input_tp?: unknown;
  input_lra?: unknown;
  input_thresh?: unknown;
  target_offset?: unknown;
}

function toFiniteNumber(value: unknown, fieldName: string): number {
  if (typeof value !== "string" && typeof value !== "number") {
    throw new Error(`FFmpeg loudness result is missing ${fieldName}.`);
  }

  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new Error(`FFmpeg loudness result has invalid ${fieldName}.`);
  }

  return number;
}

export function buildLoudnessAnalysisArguments(
  inputPath: string,
  audioStreamIndex: number,
): string[] {
  return [
    "-hide_banner",
    "-nostdin",
    "-i", inputPath,
    "-map", `0:${audioStreamIndex}`,
    "-af",
    `loudnorm=I=${LOUDNESS_TARGET_INTEGRATED_LUFS}:TP=${LOUDNESS_TARGET_TRUE_PEAK_DBTP}:LRA=${LOUDNESS_TARGET_RANGE_LU}:print_format=json`,
    "-vn",
    "-sn",
    "-dn",
    "-f", "null",
    "-",
  ];
}

export function parseLoudnessMeasurement(
  ffmpegOutput: string,
): LoudnessMeasurement {
  const jsonMatch = ffmpegOutput.match(
    /\{\s*"input_i"\s*:[\s\S]*?"target_offset"\s*:\s*[^}]+\}/,
  );

  if (!jsonMatch) {
    throw new Error("FFmpeg loudness result was not found.");
  }

  let parsed: LoudnormJson;
  try {
    parsed = JSON.parse(jsonMatch[0]) as LoudnormJson;
  } catch {
    throw new Error("FFmpeg loudness result is invalid JSON.");
  }

  return {
    inputIntegratedLufs: toFiniteNumber(parsed.input_i, "input_i"),
    inputTruePeakDbtp: toFiniteNumber(parsed.input_tp, "input_tp"),
    inputLoudnessRangeLu: toFiniteNumber(parsed.input_lra, "input_lra"),
    inputThresholdLufs: toFiniteNumber(parsed.input_thresh, "input_thresh"),
    targetOffsetLu: toFiniteNumber(parsed.target_offset, "target_offset"),
  };
}

export async function measureAudioLoudness(
  inputPath: string,
  audioStreamIndex: number,
): Promise<LoudnessMeasurement> {
  const ffmpegBinary = getFfmpegBinaryPath();
  const args = buildLoudnessAnalysisArguments(inputPath, audioStreamIndex);

  try {
    const { stderr } = await execFileAsync(ffmpegBinary, args, {
      timeout: LOUDNESS_ANALYSIS_TIMEOUT_MS,
      maxBuffer: PROCESS_OUTPUT_MAX_BUFFER_BYTES,
      windowsHide: true,
    });

    return parseLoudnessMeasurement(stderr);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`FFmpeg loudness analysis failed: ${message}`);
  }
}
