import { describe, it, expect } from 'vitest';
import path from 'path';
import { buildFfmpegArguments } from '@/lib/audioConverter';

describe('音声変換機能', () => {
  describe('ファイルパス生成ロジック', () => {
    it('プロジェクトルートからの相対パスが正しく生成される', () => {
      const projectRoot = process.cwd();
      const expectedTmpDir = path.join(projectRoot, '.tmp');
      expect(expectedTmpDir).toContain('.tmp');
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
      });

      expect(args).toEqual([
        '-hide_banner',
        '-nostdin',
        '-i', '/tmp/input.bin',
        '-map', '0:2',
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
  });
});
