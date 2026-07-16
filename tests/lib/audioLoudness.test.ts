import { describe, expect, it } from "vitest";
import {
  buildLoudnessAnalysisArguments,
  parseLoudnessMeasurement,
} from "@/lib/audioLoudness";

describe("音声ラウドネス測定", () => {
  it("対象ストリームをEBU R128基準で測定するFFmpeg引数を生成する", () => {
    const args = buildLoudnessAnalysisArguments("/tmp/input.bin", 2);

    expect(args).toEqual([
      "-hide_banner",
      "-nostdin",
      "-i", "/tmp/input.bin",
      "-map", "0:2",
      "-af", "loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json",
      "-vn",
      "-sn",
      "-dn",
      "-f", "null",
      "-",
    ]);
  });

  it("FFmpegのログに含まれる測定JSONを解析する", () => {
    const output = `
[Parsed_loudnorm_0 @ 000001] {
\t"input_i" : "-22.10",
\t"input_tp" : "-3.20",
\t"input_lra" : "7.10",
\t"input_thresh" : "-32.50",
\t"output_i" : "-15.80",
\t"output_tp" : "-1.50",
\t"output_lra" : "6.90",
\t"output_thresh" : "-26.20",
\t"normalization_type" : "dynamic",
\t"target_offset" : "-0.20"
}
`;

    expect(parseLoudnessMeasurement(output)).toEqual({
      inputIntegratedLufs: -22.1,
      inputTruePeakDbtp: -3.2,
      inputLoudnessRangeLu: 7.1,
      inputThresholdLufs: -32.5,
      targetOffsetLu: -0.2,
    });
  });

  it("測定JSONがない場合はエラーにする", () => {
    expect(() => parseLoudnessMeasurement("ffmpeg error output")).toThrow(
      "FFmpeg loudness result was not found.",
    );
  });

  it("無音などで測定値が有限数でない場合はエラーにする", () => {
    const output = `{
      "input_i": "-inf",
      "input_tp": "-inf",
      "input_lra": "0.00",
      "input_thresh": "-70.00",
      "target_offset": "inf"
    }`;

    expect(() => parseLoudnessMeasurement(output)).toThrow(
      "FFmpeg loudness result has invalid input_i.",
    );
  });
});
