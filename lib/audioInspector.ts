import { execFile } from "child_process";
import { createRequire } from "module";
import { promisify } from "util";

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);
const ffprobeInstaller = require("@ffprobe-installer/ffprobe") as {
  path: string;
};

const FFPROBE_TIMEOUT_MS = 10_000;
const FFPROBE_MAX_BUFFER_BYTES = 1024 * 1024;

export interface AudioStreamMetadata {
  index: number;
  codecType: string | null;
  codecName: string | null;
  durationSeconds: number | null;
  sampleRate: number | null;
  channels: number | null;
  attachedPicture: boolean;
}

export interface AudioFileMetadata {
  formatName: string | null;
  durationSeconds: number | null;
  streams: AudioStreamMetadata[];
}

interface FfprobeJson {
  format?: {
    format_name?: unknown;
    duration?: unknown;
  };
  streams?: Array<{
    index?: unknown;
    codec_type?: unknown;
    codec_name?: unknown;
    duration?: unknown;
    sample_rate?: unknown;
    channels?: unknown;
    disposition?: {
      attached_pic?: unknown;
    };
  }>;
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value !== "string" && typeof value !== "number") {
    return null;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function toStringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function parseFfprobeOutput(stdout: string): AudioFileMetadata {
  let parsed: FfprobeJson;

  try {
    parsed = JSON.parse(stdout) as FfprobeJson;
  } catch {
    throw new Error("FFprobe returned invalid JSON.");
  }

  const streams = Array.isArray(parsed.streams) ? parsed.streams : [];

  return {
    formatName: toStringOrNull(parsed.format?.format_name),
    durationSeconds: toFiniteNumber(parsed.format?.duration),
    streams: streams.map((stream, position) => ({
      index: toFiniteNumber(stream.index) ?? position,
      codecType: toStringOrNull(stream.codec_type),
      codecName: toStringOrNull(stream.codec_name),
      durationSeconds: toFiniteNumber(stream.duration),
      sampleRate: toFiniteNumber(stream.sample_rate),
      channels: toFiniteNumber(stream.channels),
      attachedPicture: stream.disposition?.attached_pic === 1,
    })),
  };
}

export async function inspectAudioFile(
  inputPath: string,
): Promise<AudioFileMetadata> {
  const args = [
    "-v", "error",
    "-print_format", "json",
    "-show_format",
    "-show_streams",
    inputPath,
  ];

  try {
    const { stdout } = await execFileAsync(ffprobeInstaller.path, args, {
      timeout: FFPROBE_TIMEOUT_MS,
      maxBuffer: FFPROBE_MAX_BUFFER_BYTES,
      windowsHide: true,
    });

    return parseFfprobeOutput(stdout);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Audio inspection failed: ${message}`);
  }
}
