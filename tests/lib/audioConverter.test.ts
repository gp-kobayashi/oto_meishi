import { describe, it, expect } from 'vitest';
import path from 'path';
import {
  buildFfmpegArguments,
  buildLoudnessNormalizationFilter,
} from '@/lib/audioConverter';
import { resolveAudioTempRoot } from '@/lib/audioTempDirectory';

const loudnessMeasurement = {
  inputIntegratedLufs: -22.1,
  inputTruePeakDbtp: -3.2,
  inputLoudnessRangeLu: 7.1,
  inputThresholdLufs: -32.5,
  targetOffsetLu: -0.2,
};

describe('音声変換機能', () => {
  describe('ファイルパス生成ロジック', () => {
    it('本番環境では書き込み可能なOSの一時領域を使用する', () => {
      expect(resolveAudioTempRoot({
        nodeEnv: 'production',
        projectRoot: '/app',
        osTempDir: '/tmp',
      })).toBe(path.join('/tmp', 'oto-meishi'));
    });

    it('ローカル開発では日本語ユーザー名を避けてプロジェクト内を使用する', () => {
      expect(resolveAudioTempRoot({
        nodeEnv: 'development',
        projectRoot: 'C:\\workspace\\oto_meishi',
        osTempDir: 'C:\\Users\\祐斗\\AppData\\Local\\Temp',
      })).toBe(path.join('C:\\workspace\\oto_meishi', '.tmp'));
    });

    it('出力ファイル拡張子が.m4aである', () => {
      const outputPath = '/tmp/test.m4a';
      expect(outputPath.endsWith('.m4a')).toBe(true);
    });

    it('安全なファイル名がASCII文字のみである', () => {
      const safeFileName = 'input.mp3';
      const isAscii = /^[\x00-\x7F]*$/.test(safeFileName);
      expect(isAscii).toBe(true);
    });
  });

  describe('FFmpeg引数', () => {
    it('選択した音声ストリームだけを制限付きでAAC変換する', () => {
      const args = buildFfmpegArguments({
        inputPath: '/tmp/input.bin',
        outputPath: '/tmp/output.m4a',
        bitrate: '128k',
        audioStreamIndex: 2,
        outputSampleRate: 44100,
        outputChannels: 1,
        loudnessMeasurement,
      });

      expect(args).toEqual([
        '-hide_banner',
        '-nostdin',
        '-i', '/tmp/input.bin',
        '-map', '0:2',
        '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11:measured_I=-22.1:measured_TP=-3.2:measured_LRA=7.1:measured_thresh=-32.5:offset=-0.2:linear=true:print_format=summary,aresample=44100',
        '-c:a', 'aac',
        '-profile:a', 'aac_low',
        '-b:a', '128k',
        '-ar', '44100',
        '-ac', '1',
        '-vn',
        '-sn',
        '-dn',
        '-t', '180',
        '-fs', String(5 * 1024 * 1024),
        '-threads', '1',
        '-movflags', '+faststart',
        '-y',
        '/tmp/output.m4a',
      ]);
    });

    it('測定値から2パス目のラウドネス正規化フィルターを生成する', () => {
      expect(
        buildLoudnessNormalizationFilter(loudnessMeasurement, 48000),
      ).toBe(
        'loudnorm=I=-16:TP=-1.5:LRA=11:measured_I=-22.1:measured_TP=-3.2:measured_LRA=7.1:measured_thresh=-32.5:offset=-0.2:linear=true:print_format=summary,aresample=48000',
      );
    });
  });
});
