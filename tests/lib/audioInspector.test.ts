import { describe, expect, it } from "vitest";
import path from "path";
import { inspectAudioFile, parseFfprobeOutput } from "@/lib/audioInspector";

describe("音声メタデータ解析", () => {
  it("FFprobeのJSONをアプリ用メタデータへ変換する", () => {
    const metadata = parseFfprobeOutput(JSON.stringify({
      format: {
        format_name: "mov,mp4,m4a,3gp,3g2,mj2",
        duration: "123.456",
      },
      streams: [
        {
          index: 0,
          codec_type: "audio",
          codec_name: "aac",
          duration: "123.400",
          sample_rate: "48000",
          channels: 2,
          disposition: { attached_pic: 0 },
        },
        {
          index: 1,
          codec_type: "video",
          codec_name: "mjpeg",
          disposition: { attached_pic: 1 },
        },
      ],
    }));

    expect(metadata).toEqual({
      formatName: "mov,mp4,m4a,3gp,3g2,mj2",
      durationSeconds: 123.456,
      streams: [
        {
          index: 0,
          codecType: "audio",
          codecName: "aac",
          durationSeconds: 123.4,
          sampleRate: 48000,
          channels: 2,
          attachedPicture: false,
        },
        {
          index: 1,
          codecType: "video",
          codecName: "mjpeg",
          durationSeconds: null,
          sampleRate: null,
          channels: null,
          attachedPicture: true,
        },
      ],
    });
  });

  it("省略された値と数値でない値をnullとして扱う", () => {
    const metadata = parseFfprobeOutput(JSON.stringify({
      format: { duration: "N/A" },
      streams: [{ sample_rate: "unknown", channels: null }],
    }));

    expect(metadata).toEqual({
      formatName: null,
      durationSeconds: null,
      streams: [
        {
          index: 0,
          codecType: null,
          codecName: null,
          durationSeconds: null,
          sampleRate: null,
          channels: null,
          attachedPicture: false,
        },
      ],
    });
  });

  it("streamsがない場合は空配列を返す", () => {
    expect(parseFfprobeOutput("{}")).toEqual({
      formatName: null,
      durationSeconds: null,
      streams: [],
    });
  });

  it("不正なJSONの場合はエラーを返す", () => {
    expect(() => parseFfprobeOutput("not-json")).toThrow(
      "FFprobe returned invalid JSON.",
    );
  });

  it("実際の音声ファイルをFFprobeで解析する", async () => {
    const inputPath = path.join(process.cwd(), "public", "demo", "sound.mp3");

    const metadata = await inspectAudioFile(inputPath);

    expect(metadata.formatName?.split(",")).toContain("mp3");
    expect(metadata.durationSeconds).toBeGreaterThan(0);
    expect(metadata.streams).toEqual(expect.arrayContaining([
      expect.objectContaining({
        codecType: "audio",
        codecName: "mp3",
        sampleRate: 44100,
        channels: 2,
      }),
    ]));
  });
});
