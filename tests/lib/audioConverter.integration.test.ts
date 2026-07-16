import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "fs/promises";
import path from "path";
import { convertToAac } from "@/lib/audioConverter";
import {
  LOUDNESS_TARGET_INTEGRATED_LUFS,
  LOUDNESS_TARGET_TRUE_PEAK_DBTP,
  measureAudioLoudness,
} from "@/lib/audioLoudness";

describe("音声ラウドネス正規化の結合テスト", () => {
  let tempDir: string;

  beforeAll(async () => {
    const projectTempDir = path.join(process.cwd(), ".tmp");
    await fs.mkdir(projectTempDir, { recursive: true });
    tempDir = await fs.mkdtemp(path.join(projectTempDir, "loudness-test-"));
  });

  afterAll(async () => {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it("実音源を目標ラウドネスのAACへ変換する", async () => {
    const inputPath = path.join(process.cwd(), "public", "demo", "sound.mp3");
    const outputPath = path.join(tempDir, "output.m4a");

    await convertToAac({
      inputPath,
      outputPath,
      bitrate: "128k",
      audioStreamIndex: 0,
      outputSampleRate: 44_100,
      outputChannels: 2,
    });

    const outputStat = await fs.stat(outputPath);
    const measurement = await measureAudioLoudness(outputPath, 0);

    expect(outputStat.size).toBeGreaterThan(0);
    expect(
      Math.abs(
        measurement.inputIntegratedLufs - LOUDNESS_TARGET_INTEGRATED_LUFS,
      ),
    ).toBeLessThanOrEqual(0.2);
    expect(measurement.inputTruePeakDbtp).toBeLessThanOrEqual(
      LOUDNESS_TARGET_TRUE_PEAK_DBTP,
    );
  }, 20_000);
});
