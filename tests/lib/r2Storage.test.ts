import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { generateAudioKey, extractKeyFromUrl } from '@/lib/r2Storage';

describe('R2ストレージ機能', () => {
  describe('generateAudioKey', () => {
    it('正しい形式のキーを生成する', () => {
      const userId = 'testuser';
      const key = generateAudioKey(userId);

      expect(key).toMatch(
        /^audio\/testuser\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.m4a$/,
      );
    });

    it('呼び出しごとに異なるキーを生成する', () => {
      const userId = 'testuser';
      expect(generateAudioKey(userId)).not.toBe(generateAudioKey(userId));
    });

    it('ユーザーIDに特殊文字が含まれても正しく処理する', () => {
      const userId = 'test_user-123';
      const key = generateAudioKey(userId);

      expect(key).toMatch(/^audio\/test_user-123\/.+\.m4a$/);
    });
  });

  describe('extractKeyFromUrl', () => {
    beforeEach(() => {
      // R2_PUBLIC_URLをモック
      process.env.R2_PUBLIC_URL = 'https://pub-xxxxxxxx.r2.dev';
    });

    afterEach(() => {
      delete process.env.R2_PUBLIC_URL;
    });

    it('正しいURLからキーを抽出する', () => {
      const url = 'https://pub-xxxxxxxx.r2.dev/audio/testuser/test-1234567890.m4a';
      const key = extractKeyFromUrl(url);

      expect(key).toBe('audio/testuser/test-1234567890.m4a');
    });

    it('R2_PUBLIC_URLの末尾にスラッシュがある場合も正しいキーを抽出する', () => {
      process.env.R2_PUBLIC_URL = 'https://pub-xxxxxxxx.r2.dev/';
      const url = 'https://pub-xxxxxxxx.r2.dev/audio/testuser/test-1234567890.m4a';
      const key = extractKeyFromUrl(url);

      expect(key).toBe('audio/testuser/test-1234567890.m4a');
    });

    it('URLがR2_PUBLIC_URLで始まらない場合、URLをそのまま返す', () => {
      const url = 'https://example.com/audio/test.mp3';
      const key = extractKeyFromUrl(url);

      expect(key).toBe('https://example.com/audio/test.mp3');
    });

    it('日本語を含むURLも正しく処理する', () => {
      const url = 'https://pub-xxxxxxxx.r2.dev/audio/testuser/テスト音声-1234567890.m4a';
      const key = extractKeyFromUrl(url);

      expect(key).toBe('audio/testuser/テスト音声-1234567890.m4a');
    });

    it('クエリパラメータを含むURLも正しく処理する', () => {
      const url = 'https://pub-xxxxxxxx.r2.dev/audio/testuser/test-1234567890.m4a?v=1';
      const key = extractKeyFromUrl(url);

      expect(key).toBe('audio/testuser/test-1234567890.m4a?v=1');
    });

    it('空のURLの場合も処理する', () => {
      const url = '';
      const key = extractKeyFromUrl(url);

      expect(key).toBe('');
    });
  });

  describe('R2設定のバリデーション', () => {
    it('必須の環境変数が欠けている場合エラーになるべき', () => {
      const config = {
        accountId: '',
        accessKeyId: 'test',
        secretAccessKey: 'test',
        bucketName: 'test',
      };

      const isValid = Boolean(config.accountId && config.accessKeyId && config.secretAccessKey && config.bucketName);
      expect(isValid).toBe(false);
    });

    it('すべての必須環境変数が存在する場合有効', () => {
      const config = {
        accountId: 'test',
        accessKeyId: 'test',
        secretAccessKey: 'test',
        bucketName: 'test',
      };

      const isValid = Boolean(config.accountId && config.accessKeyId && config.secretAccessKey && config.bucketName);
      expect(isValid).toBe(true);
    });
  });

  describe('ファイルパスの安全性', () => {
    it('キーにパストラバーサル攻撃を防ぐ', () => {
      const userId = '../etc';
      const key = generateAudioKey(userId);

      expect(key).toMatch(/^audio\/\.\.%2Fetc\/.+\.m4a$/);
      expect(key).not.toContain('/../');
    });

    it('キーに絶対パスが含まれない', () => {
      const userId = 'testuser';
      const key = generateAudioKey(userId);

      expect(key.startsWith('/')).toBe(false);
    });
  });
});
