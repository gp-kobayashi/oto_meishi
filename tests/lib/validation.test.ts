import { describe, it, expect } from 'vitest';
import {
  validateDisplayName,
  validateBio,
  validateAudioTitle,
  validateSocialLabel,
  validateSocialUrl,
  validateProfile,
  MAX_DISPLAY_NAME_LENGTH,
  MAX_BIO_LENGTH,
  MAX_AUDIO_TITLE_LENGTH,
  MAX_SOCIAL_LABEL_LENGTH,
} from '@/lib/validation';

describe('バリデーション関数', () => {
  describe('validateDisplayName', () => {
    it('正常な長さの表示名はエラーを返さない', () => {
      expect(validateDisplayName('テスト')).toBeUndefined();
      expect(validateDisplayName('a'.repeat(MAX_DISPLAY_NAME_LENGTH))).toBeUndefined();
    });

    it('文字数制限を超える表示名はエラーを返す', () => {
      const result = validateDisplayName('a'.repeat(MAX_DISPLAY_NAME_LENGTH + 1));
      expect(result).toBe(`文字数制限を超えています（${MAX_DISPLAY_NAME_LENGTH}文字まで）`);
    });

    it('空文字はエラーを返さない', () => {
      expect(validateDisplayName('')).toBeUndefined();
    });
  });

  describe('validateBio', () => {
    it('正常な長さの自己紹介はエラーを返さない', () => {
      expect(validateBio('テスト')).toBeUndefined();
      expect(validateBio('a'.repeat(MAX_BIO_LENGTH))).toBeUndefined();
    });

    it('文字数制限を超える自己紹介はエラーを返す', () => {
      const result = validateBio('a'.repeat(MAX_BIO_LENGTH + 1));
      expect(result).toBe(`文字数制限を超えています（${MAX_BIO_LENGTH}文字まで）`);
    });

    it('空文字はエラーを返さない', () => {
      expect(validateBio('')).toBeUndefined();
    });
  });

  describe('validateAudioTitle', () => {
    it('正常な長さの音声タイトルはエラーを返さない', () => {
      expect(validateAudioTitle('テスト')).toBeUndefined();
      expect(validateAudioTitle('a'.repeat(MAX_AUDIO_TITLE_LENGTH))).toBeUndefined();
    });

    it('文字数制限を超える音声タイトルはエラーを返す', () => {
      const result = validateAudioTitle('a'.repeat(MAX_AUDIO_TITLE_LENGTH + 1));
      expect(result).toBe(`文字数制限を超えています（${MAX_AUDIO_TITLE_LENGTH}文字まで）`);
    });

    it('空文字はエラーを返さない', () => {
      expect(validateAudioTitle('')).toBeUndefined();
    });
  });

  describe('validateSocialLabel', () => {
    it('正常な長さのSNSラベルはエラーを返さない', () => {
      expect(validateSocialLabel('テスト')).toBeUndefined();
      expect(validateSocialLabel('a'.repeat(MAX_SOCIAL_LABEL_LENGTH))).toBeUndefined();
    });

    it('文字数制限を超えるSNSラベルはエラーを返す', () => {
      const result = validateSocialLabel('a'.repeat(MAX_SOCIAL_LABEL_LENGTH + 1));
      expect(result).toBe(`文字数制限を超えています（${MAX_SOCIAL_LABEL_LENGTH}文字まで）`);
    });

    it('空文字はエラーを返さない', () => {
      expect(validateSocialLabel('')).toBeUndefined();
    });
  });

  describe('validateSocialUrl', () => {
    it('HTTPSのURLはエラーを返さない', () => {
      expect(validateSocialUrl('https://x.com/test')).toBeUndefined();
    });

    it('空文字はエラーを返さない', () => {
      expect(validateSocialUrl('')).toBeUndefined();
    });

    it('HTTPと危険なスキームはHTTPSエラーを返す', () => {
      expect(validateSocialUrl('http://x.com/test')).toBe(
        'URLはhttps://から入力してください。',
      );
      expect(validateSocialUrl('javascript:alert(1)')).toBe(
        'URLはhttps://から入力してください。',
      );
    });

    it('不正なURLは形式エラーを返す', () => {
      expect(validateSocialUrl('x.com/test')).toBe('無効なURL形式です。');
    });
  });

  describe('validateProfile', () => {
    it('すべてのフィールドが正常な場合はエラーを返さない', () => {
      const profile = {
        displayName: 'テストユーザー',
        bio: 'テスト自己紹介',
        audioTitle: 'テスト音声',
        sns: [
          { service: 'x', url: 'https://x.com/test', label: 'Twitter' },
          { service: 'instagram', url: 'https://instagram.com/test', label: 'Instagram' },
        ],
      };

      const result = validateProfile(profile);
      expect(result).toEqual({});
    });

    it('表示名が文字数制限を超える場合はエラーを返す', () => {
      const profile = {
        displayName: 'a'.repeat(MAX_DISPLAY_NAME_LENGTH + 1),
        bio: 'テスト自己紹介',
        audioTitle: 'テスト音声',
        sns: [],
      };

      const result = validateProfile(profile);
      expect(result.displayName).toBe(`文字数制限を超えています（${MAX_DISPLAY_NAME_LENGTH}文字まで）`);
    });

    it('自己紹介が文字数制限を超える場合はエラーを返す', () => {
      const profile = {
        displayName: 'テストユーザー',
        bio: 'a'.repeat(MAX_BIO_LENGTH + 1),
        audioTitle: 'テスト音声',
        sns: [],
      };

      const result = validateProfile(profile);
      expect(result.bio).toBe(`文字数制限を超えています（${MAX_BIO_LENGTH}文字まで）`);
    });

    it('音声タイトルが文字数制限を超える場合はエラーを返す', () => {
      const profile = {
        displayName: 'テストユーザー',
        bio: 'テスト自己紹介',
        audioTitle: 'a'.repeat(MAX_AUDIO_TITLE_LENGTH + 1),
        sns: [],
      };

      const result = validateProfile(profile);
      expect(result.audioTitle).toBe(`文字数制限を超えています（${MAX_AUDIO_TITLE_LENGTH}文字まで）`);
    });

    it('SNSラベルが文字数制限を超える場合はエラーを返す', () => {
      const profile = {
        displayName: 'テストユーザー',
        bio: 'テスト自己紹介',
        audioTitle: 'テスト音声',
        sns: [
          { service: 'x', url: 'https://x.com/test', label: 'a'.repeat(MAX_SOCIAL_LABEL_LENGTH + 1) },
        ],
      };

      const result = validateProfile(profile);
      expect(result.sns?.[0]?.label).toBe(`文字数制限を超えています（${MAX_SOCIAL_LABEL_LENGTH}文字まで）`);
    });

    it('SNS URLがHTTPSでない場合はエラーを返す', () => {
      const result = validateProfile({
        displayName: 'テストユーザー',
        bio: 'テスト自己紹介',
        audioTitle: 'テスト音声',
        sns: [
          { service: 'x', url: 'http://x.com/test', label: 'Twitter' },
        ],
      });

      expect(result.sns?.[0]?.url).toBe(
        'URLはhttps://から入力してください。',
      );
    });

    it('複数のSNSラベルが文字数制限を超える場合はすべてのエラーを返す', () => {
      const profile = {
        displayName: 'テストユーザー',
        bio: 'テスト自己紹介',
        audioTitle: 'テスト音声',
        sns: [
          { service: 'x', url: 'https://x.com/test', label: 'a'.repeat(MAX_SOCIAL_LABEL_LENGTH + 1) },
          { service: 'instagram', url: 'https://instagram.com/test', label: 'b'.repeat(MAX_SOCIAL_LABEL_LENGTH + 1) },
        ],
      };

      const result = validateProfile(profile);
      expect(result.sns?.[0]?.label).toBe(`文字数制限を超えています（${MAX_SOCIAL_LABEL_LENGTH}文字まで）`);
      expect(result.sns?.[1]?.label).toBe(`文字数制限を超えています（${MAX_SOCIAL_LABEL_LENGTH}文字まで）`);
    });

    it('複数のフィールドが文字数制限を超える場合はすべてのエラーを返す', () => {
      const profile = {
        displayName: 'a'.repeat(MAX_DISPLAY_NAME_LENGTH + 1),
        bio: 'a'.repeat(MAX_BIO_LENGTH + 1),
        audioTitle: 'a'.repeat(MAX_AUDIO_TITLE_LENGTH + 1),
        sns: [
          { service: 'x', url: 'https://x.com/test', label: 'a'.repeat(MAX_SOCIAL_LABEL_LENGTH + 1) },
        ],
      };

      const result = validateProfile(profile);
      expect(result.displayName).toBe(`文字数制限を超えています（${MAX_DISPLAY_NAME_LENGTH}文字まで）`);
      expect(result.bio).toBe(`文字数制限を超えています（${MAX_BIO_LENGTH}文字まで）`);
      expect(result.audioTitle).toBe(`文字数制限を超えています（${MAX_AUDIO_TITLE_LENGTH}文字まで）`);
      expect(result.sns?.[0]?.label).toBe(`文字数制限を超えています（${MAX_SOCIAL_LABEL_LENGTH}文字まで）`);
    });

    it('正常なSNSラベルと制限超えのSNSラベルが混在する場合、制限超えのみエラーを返す', () => {
      const profile = {
        displayName: 'テストユーザー',
        bio: 'テスト自己紹介',
        audioTitle: 'テスト音声',
        sns: [
          { service: 'x', url: 'https://x.com/test', label: 'Twitter' },
          { service: 'instagram', url: 'https://instagram.com/test', label: 'a'.repeat(MAX_SOCIAL_LABEL_LENGTH + 1) },
          { service: 'youtube', url: 'https://youtube.com/test', label: 'YouTube' },
        ],
      };

      const result = validateProfile(profile);
      expect(result.sns?.[0]).toBeUndefined();
      expect(result.sns?.[1]?.label).toBe(`文字数制限を超えています（${MAX_SOCIAL_LABEL_LENGTH}文字まで）`);
      expect(result.sns?.[2]).toBeUndefined();
    });
  });
});
