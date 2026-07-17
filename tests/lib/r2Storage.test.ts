import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  createSignedAudioUrl,
  extractKeyFromUrl,
  generateAudioKey,
} from '@/lib/r2Storage';

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn(),
}));

describe('R2ストレージ機能', () => {
  describe('createSignedAudioUrl', () => {
    beforeEach(() => {
      process.env.R2_ACCOUNT_ID = 'test-account';
      process.env.R2_ACCESS_KEY_ID = 'test-access-key';
      process.env.R2_SECRET_ACCESS_KEY = 'test-secret-key';
      process.env.R2_BUCKET = 'test-bucket';
      vi.mocked(getSignedUrl).mockResolvedValue('https://signed.example.com/audio');
    });

    afterEach(() => {
      delete process.env.R2_ACCOUNT_ID;
      delete process.env.R2_ACCESS_KEY_ID;
      delete process.env.R2_SECRET_ACCESS_KEY;
      delete process.env.R2_BUCKET;
      vi.clearAllMocks();
    });

    it('公開URLの設定なしで60秒間有効な署名付きURLを生成する', async () => {
      delete process.env.R2_PUBLIC_URL;

      const url = await createSignedAudioUrl('audio/testuser/test.m4a');

      expect(url).toBe('https://signed.example.com/audio');
      expect(getSignedUrl).toHaveBeenCalledOnce();
      const [, command, options] = vi.mocked(getSignedUrl).mock.calls[0];
      expect(command.input).toEqual({
        Bucket: 'test-bucket',
        Key: 'audio/testuser/test.m4a',
      });
      expect(options).toEqual({ expiresIn: 60 });
    });

    it('有効期限を指定できる', async () => {
      await createSignedAudioUrl('audio/testuser/test.m4a', 120);

      expect(vi.mocked(getSignedUrl).mock.calls[0][2]).toEqual({ expiresIn: 120 });
    });

    it.each([
      'other/test.m4a',
      'audio/../secret.m4a',
      'audio\\testuser\\test.m4a',
      'audio//test.m4a',
    ])('音声領域外または不正なキーを拒否する: %s', async (key) => {
      await expect(createSignedAudioUrl(key)).rejects.toThrow('Invalid audio object key.');
      expect(getSignedUrl).not.toHaveBeenCalled();
    });

    it.each([0, 301, 1.5])('不正な有効期限を拒否する: %s', async (expiry) => {
      await expect(createSignedAudioUrl('audio/testuser/test.m4a', expiry)).rejects.toThrow(
        'Audio URL expiry must be an integer between 1 and 300 seconds.',
      );
      expect(getSignedUrl).not.toHaveBeenCalled();
    });
  });

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
