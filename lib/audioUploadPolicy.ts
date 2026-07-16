import type {
  AudioFileMetadata,
  AudioStreamMetadata,
} from "@/lib/audioInspector";

export const MAX_AUDIO_DURATION_SECONDS = 180;
export const MAX_AUDIO_STREAMS = 4;
export const MAX_AUDIO_CHANNELS = 8;
export const MAX_AUDIO_SAMPLE_RATE = 192_000;

const ALLOWED_FORMATS = new Set([
  "3g2",
  "3gp",
  "aiff",
  "amr",
  "ape",
  "asf",
  "caf",
  "flac",
  "m4a",
  "matroska",
  "mj2",
  "mov",
  "mp3",
  "mp4",
  "ogg",
  "wav",
  "webm",
  "wv",
]);

const ALLOWED_CODECS = new Set([
  "aac",
  "ac3",
  "alac",
  "amr_nb",
  "amr_wb",
  "ape",
  "eac3",
  "flac",
  "mp3",
  "opus",
  "speex",
  "tta",
  "vorbis",
  "wavpack",
  "wmav1",
  "wmav2",
  "wmapro",
]);

export type AudioPolicyErrorCode =
  | "unsupported_format"
  | "no_audio_stream"
  | "too_many_audio_streams"
  | "unsupported_codec"
  | "video_stream_not_allowed"
  | "invalid_duration"
  | "duration_too_long"
  | "invalid_sample_rate"
  | "sample_rate_too_high"
  | "invalid_channels"
  | "too_many_channels";

export type AudioPolicyResult =
  | {
      valid: true;
      durationSeconds: number;
      audioStreamIndex: number;
    }
  | {
      valid: false;
      code: AudioPolicyErrorCode;
      message: string;
    };

function reject(
  code: AudioPolicyErrorCode,
  message: string,
): AudioPolicyResult {
  return { valid: false, code, message };
}

function formatIsAllowed(formatName: string | null): boolean {
  if (!formatName) {
    return false;
  }

  return formatName
    .split(",")
    .some((format) => ALLOWED_FORMATS.has(format.trim().toLowerCase()));
}

function codecIsAllowed(codecName: string | null): boolean {
  if (!codecName) {
    return false;
  }

  const normalized = codecName.toLowerCase();
  return ALLOWED_CODECS.has(normalized) ||
    normalized.startsWith("pcm_") ||
    normalized.startsWith("adpcm_");
}

function resolveDuration(
  metadata: AudioFileMetadata,
  audioStreams: AudioStreamMetadata[],
): number | null {
  if (metadata.durationSeconds !== null) {
    return metadata.durationSeconds;
  }

  const streamDurations = audioStreams
    .map((stream) => stream.durationSeconds)
    .filter((duration): duration is number => duration !== null);

  return streamDurations.length > 0 ? Math.max(...streamDurations) : null;
}

export function validateAudioMetadata(
  metadata: AudioFileMetadata,
): AudioPolicyResult {
  if (!formatIsAllowed(metadata.formatName)) {
    return reject(
      "unsupported_format",
      "対応していない音声ファイル形式です。",
    );
  }

  const audioStreams = metadata.streams.filter(
    (stream) => stream.codecType === "audio",
  );

  if (audioStreams.length === 0) {
    return reject(
      "no_audio_stream",
      "音声ストリームが見つかりません。",
    );
  }

  if (audioStreams.length > MAX_AUDIO_STREAMS) {
    return reject(
      "too_many_audio_streams",
      "音声ストリームの数が多すぎます。",
    );
  }

  const unsupportedAudioStream = audioStreams.find(
    (stream) => !codecIsAllowed(stream.codecName),
  );
  if (unsupportedAudioStream) {
    return reject(
      "unsupported_codec",
      "対応していない音声コーデックです。",
    );
  }

  const hasVideo = metadata.streams.some(
    (stream) => stream.codecType === "video" && !stream.attachedPicture,
  );
  if (hasVideo) {
    return reject(
      "video_stream_not_allowed",
      "動画を含むファイルはアップロードできません。",
    );
  }

  const durationSeconds = resolveDuration(metadata, audioStreams);
  if (
    durationSeconds === null ||
    !Number.isFinite(durationSeconds) ||
    durationSeconds <= 0
  ) {
    return reject(
      "invalid_duration",
      "音声の再生時間を確認できません。",
    );
  }

  if (durationSeconds > MAX_AUDIO_DURATION_SECONDS) {
    return reject(
      "duration_too_long",
      "音声は3分以内にしてください。",
    );
  }

  for (const stream of audioStreams) {
    if (
      stream.sampleRate === null ||
      !Number.isInteger(stream.sampleRate) ||
      stream.sampleRate <= 0
    ) {
      return reject(
        "invalid_sample_rate",
        "音声のサンプルレートを確認できません。",
      );
    }

    if (stream.sampleRate > MAX_AUDIO_SAMPLE_RATE) {
      return reject(
        "sample_rate_too_high",
        "音声のサンプルレートが高すぎます。",
      );
    }

    if (
      stream.channels === null ||
      !Number.isInteger(stream.channels) ||
      stream.channels <= 0
    ) {
      return reject(
        "invalid_channels",
        "音声のチャンネル数を確認できません。",
      );
    }

    if (stream.channels > MAX_AUDIO_CHANNELS) {
      return reject(
        "too_many_channels",
        "音声のチャンネル数が多すぎます。",
      );
    }
  }

  return {
    valid: true,
    durationSeconds,
    audioStreamIndex: audioStreams[0].index,
  };
}
