import { describe, expect, it } from "vitest";
import type {
  AudioFileMetadata,
  AudioStreamMetadata,
} from "@/lib/audioInspector";
import { validateAudioMetadata } from "@/lib/audioUploadPolicy";

function audioStream(
  overrides: Partial<AudioStreamMetadata> = {},
): AudioStreamMetadata {
  return {
    index: 0,
    codecType: "audio",
    codecName: "aac",
    durationSeconds: 120,
    sampleRate: 48000,
    channels: 2,
    attachedPicture: false,
    ...overrides,
  };
}

function metadata(
  overrides: Partial<AudioFileMetadata> = {},
): AudioFileMetadata {
  return {
    formatName: "mov,mp4,m4a,3gp,3g2,mj2",
    durationSeconds: 120,
    streams: [audioStream()],
    ...overrides,
  };
}

function expectRejected(
  value: AudioFileMetadata,
  code: string,
) {
  expect(validateAudioMetadata(value)).toEqual(
    expect.objectContaining({ valid: false, code }),
  );
}

describe("音声アップロード受付ポリシー", () => {
  it.each([
    ["mp3", "mp3"],
    ["wav", "pcm_s16le"],
    ["caf", "alac"],
    ["aiff", "pcm_s24be"],
    ["flac", "flac"],
    ["ogg", "vorbis"],
    ["matroska,webm", "opus"],
    ["3gp", "amr_nb"],
    ["asf", "wmav2"],
  ])("%s / %sを許可する", (formatName, codecName) => {
    const result = validateAudioMetadata(metadata({
      formatName,
      streams: [audioStream({ codecName })],
    }));

    expect(result).toEqual({
      valid: true,
      durationSeconds: 120,
      audioStreamIndex: 0,
    });
  });

  it("180秒ちょうどを許可する", () => {
    expect(validateAudioMetadata(metadata({ durationSeconds: 180 })).valid)
      .toBe(true);
  });

  it("180秒を超える音声を拒否する", () => {
    expectRejected(metadata({ durationSeconds: 180.001 }), "duration_too_long");
  });

  it("コンテナの再生時間がない場合は音声ストリームの最大値を使う", () => {
    const result = validateAudioMetadata(metadata({
      durationSeconds: null,
      streams: [
        audioStream({ index: 1, durationSeconds: 90 }),
        audioStream({ index: 2, durationSeconds: 100 }),
      ],
    }));

    expect(result).toEqual({
      valid: true,
      durationSeconds: 100,
      audioStreamIndex: 1,
    });
  });

  it("再生時間が不明な音声を拒否する", () => {
    expectRejected(metadata({
      durationSeconds: null,
      streams: [audioStream({ durationSeconds: null })],
    }), "invalid_duration");
  });

  it("対応外コンテナを拒否する", () => {
    expectRejected(metadata({ formatName: "avi" }), "unsupported_format");
  });

  it("音声ストリームがないファイルを拒否する", () => {
    expectRejected(metadata({ streams: [] }), "no_audio_stream");
  });

  it("5本以上の音声ストリームを拒否する", () => {
    expectRejected(metadata({
      streams: Array.from({ length: 5 }, (_, index) => audioStream({ index })),
    }), "too_many_audio_streams");
  });

  it("対応外コーデックを拒否する", () => {
    expectRejected(metadata({
      streams: [audioStream({ codecName: "unknown_codec" })],
    }), "unsupported_codec");
  });

  it("通常の動画ストリームを拒否する", () => {
    expectRejected(metadata({
      streams: [
        audioStream(),
        {
          ...audioStream({ index: 1 }),
          codecType: "video",
          codecName: "h264",
        },
      ],
    }), "video_stream_not_allowed");
  });

  it("音声ファイルの埋め込み画像は許可する", () => {
    const result = validateAudioMetadata(metadata({
      formatName: "mp3",
      streams: [
        audioStream({ codecName: "mp3" }),
        {
          ...audioStream({ index: 1 }),
          codecType: "video",
          codecName: "mjpeg",
          attachedPicture: true,
        },
      ],
    }));

    expect(result.valid).toBe(true);
  });

  it.each([
    [null, "invalid_sample_rate"],
    [0, "invalid_sample_rate"],
    [192001, "sample_rate_too_high"],
  ])("サンプルレート %s を拒否する", (sampleRate, code) => {
    expectRejected(metadata({
      streams: [audioStream({ sampleRate })],
    }), code);
  });

  it.each([
    [null, "invalid_channels"],
    [0, "invalid_channels"],
    [9, "too_many_channels"],
  ])("チャンネル数 %s を拒否する", (channels, code) => {
    expectRejected(metadata({
      streams: [audioStream({ channels })],
    }), code);
  });
});
