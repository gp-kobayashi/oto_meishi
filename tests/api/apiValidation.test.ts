import { describe, it, expect } from 'vitest';
import {
  validateUserId,
  validateDisplayNameLength,
  validateBioLength,
  validateAudioTitleLength,
  validateSocialLabelLength,
  validateUrlFormat,
  normalizeTheme,
  normalizeSocialService,
  sanitizeSocialLinks,
  sanitizeProfileData,
} from '@/lib/apiValidation';

describe('APIバリデーション関数', () => {
  describe('validateUserId', () => {
    it('正常なuserIdはエラーを返さない', () => {
      expect(validateUserId('testuser')).toBeNull();
      expect(validateUserId('test_user')).toBeNull();
      expect(validateUserId('test-user')).toBeNull();
      expect(validateUserId('Test123')).toBeNull();
    });

    it('空文字はエラーを返す', () => {
      const result = validateUserId('');
      expect(result).toEqual({ field: 'userId', message: 'userId is required' });
    });

    it('特殊文字を含むuserIdはエラーを返す', () => {
      const result = validateUserId('test@user');
      expect(result).toEqual({
        field: 'userId',
        message: 'userId must only contain letters, numbers, hyphen, and underscore.',
      });
    });

    it('日本語を含むuserIdはエラーを返す', () => {
      const result = validateUserId('テスト');
      expect(result).toEqual({
        field: 'userId',
        message: 'userId must only contain letters, numbers, hyphen, and underscore.',
      });
    });

    it('スペースを含むuserIdはエラーを返す', () => {
      const result = validateUserId('test user');
      expect(result).toEqual({
        field: 'userId',
        message: 'userId must only contain letters, numbers, hyphen, and underscore.',
      });
    });
  });

  describe('validateDisplayNameLength', () => {
    it('正常な長さの表示名はエラーを返さない', () => {
      expect(validateDisplayNameLength('テスト')).toBeNull();
      expect(validateDisplayNameLength('a'.repeat(20))).toBeNull();
    });

    it('文字数制限を超える表示名はエラーを返す', () => {
      const result = validateDisplayNameLength('a'.repeat(21));
      expect(result).toEqual({
        field: 'displayName',
        message: '表示名は20文字までです。',
      });
    });

    it('サロゲートペアや絵文字を含む表示名のバリデーション（JavaScriptのlength基準）', () => {
      // 𠮷（サロゲートペア）は2文字としてカウントされるため、"𠮷".repeat(10) は20文字、"𠮷".repeat(11) は22文字
      expect(validateDisplayNameLength('𠮷'.repeat(10))).toBeNull();
      
      const result = validateDisplayNameLength('𠮷'.repeat(11));
      expect(result).toEqual({
        field: 'displayName',
        message: '表示名は20文字までです。',
      });

      // 👨‍👩‍👧‍👦（絵文字ファミリー）は11文字としてカウントされるため、2文字分入れると22文字でエラーになる
      const resultEmoji = validateDisplayNameLength('👨‍👩‍👧‍👦👨‍👩‍👧‍👦');
      expect(resultEmoji).toEqual({
        field: 'displayName',
        message: '表示名は20文字までです。',
      });
    });
  });

  describe('validateBioLength', () => {
    it('正常な長さの自己紹介はエラーを返さない', () => {
      expect(validateBioLength('テスト')).toBeNull();
      expect(validateBioLength('a'.repeat(60))).toBeNull();
    });

    it('文字数制限を超える自己紹介はエラーを返す', () => {
      const result = validateBioLength('a'.repeat(61));
      expect(result).toEqual({
        field: 'bio',
        message: '自己紹介は60文字までです。',
      });
    });

    it('サロゲートペアや絵文字を含む自己紹介のバリデーション（JavaScriptのlength基準）', () => {
      // 𠮷は2文字としてカウントされるため、"𠮷".repeat(30) は60文字、"𠮷".repeat(31) は62文字
      expect(validateBioLength('𠮷'.repeat(30))).toBeNull();
      
      const result = validateBioLength('𠮷'.repeat(31));
      expect(result).toEqual({
        field: 'bio',
        message: '自己紹介は60文字までです。',
      });
    });
  });

  describe('validateAudioTitleLength', () => {
    it('正常な長さの音声タイトルはエラーを返さない', () => {
      expect(validateAudioTitleLength('テスト')).toBeNull();
      expect(validateAudioTitleLength('a'.repeat(25))).toBeNull();
    });

    it('文字数制限を超える音声タイトルはエラーを返す', () => {
      const result = validateAudioTitleLength('a'.repeat(26));
      expect(result).toEqual({
        field: 'audioTitle',
        message: '音声タイトルは25文字までです。',
      });
    });
  });

  describe('validateSocialLabelLength', () => {
    it('正常な長さのSNSラベルはエラーを返さない', () => {
      expect(validateSocialLabelLength('テスト')).toBeNull();
      expect(validateSocialLabelLength('a'.repeat(25))).toBeNull();
    });

    it('文字数制限を超えるSNSラベルはエラーを返す', () => {
      const result = validateSocialLabelLength('a'.repeat(26));
      expect(result).toEqual({
        field: 'sns',
        message: 'SNSラベルは25文字までです。',
      });
    });
  });

  describe('validateUrlFormat', () => {
    it('HTTPSのURLはエラーを返さない', () => {
      expect(validateUrlFormat('https://example.com')).toBeNull();
      expect(validateUrlFormat('https://x.com/test')).toBeNull();
    });

    it('HTTPのURLはエラーを返す', () => {
      expect(validateUrlFormat('http://test.com')).toEqual({
        field: 'sns',
        message: 'URLはhttps://から入力してください。',
      });
    });

    it.each([
      'javascript:alert(1)',
      'data:text/html,<h1>test</h1>',
      'file:///C:/test.txt',
    ])('HTTPS以外のスキームを拒否する: %s', (url) => {
      expect(validateUrlFormat(url)).toEqual({
        field: 'sns',
        message: 'URLはhttps://から入力してください。',
      });
    });

    it('空文字はエラーを返す', () => {
      const result = validateUrlFormat('');
      expect(result).toEqual({
        field: 'sns',
        message: 'URLは必須です。',
      });
    });

    it('無効なURL形式はエラーを返す', () => {
      const result = validateUrlFormat('not-a-url');
      expect(result).toEqual({
        field: 'sns',
        message: '無効なURL形式です。',
      });
    });

    it('不完全なURLはエラーを返す', () => {
      const result = validateUrlFormat('http://');
      expect(result).toEqual({
        field: 'sns',
        message: '無効なURL形式です。',
      });
    });

    it('プロトコル無しのURLはエラーを返す', () => {
      const result = validateUrlFormat('x.com/test');
      expect(result).toEqual({
        field: 'sns',
        message: '無効なURL形式です。',
      });
    });
  });

  describe('normalizeTheme', () => {
    it('有効なテーマはそのまま返す', () => {
      expect(normalizeTheme('normal')).toBe('normal');
      expect(normalizeTheme('dark')).toBe('dark');
      expect(normalizeTheme('light')).toBe('light');
      expect(normalizeTheme('colorful')).toBe('colorful');
    });

    it('無効なテーマはnormalに正規化する', () => {
      expect(normalizeTheme('invalid')).toBe('normal');
      expect(normalizeTheme('')).toBe('normal');
      expect(normalizeTheme('random')).toBe('normal');
    });
  });

  describe('normalizeSocialService', () => {
    it('有効なサービスはそのまま返す', () => {
      expect(normalizeSocialService('x')).toBe('x');
      expect(normalizeSocialService('instagram')).toBe('instagram');
      expect(normalizeSocialService('youtube')).toBe('youtube');
    });

    it('無効なサービスはotherに正規化する', () => {
      expect(normalizeSocialService('invalid')).toBe('other');
      expect(normalizeSocialService('')).toBe('other');
      expect(normalizeSocialService('random')).toBe('other');
    });
  });

  describe('sanitizeSocialLinks', () => {
    it('有効なSNSリンクのみをフィルタリングする', () => {
      const input = [
        { service: 'x', url: 'https://x.com/test', label: 'Twitter' },
        { service: 'instagram', url: 'https://instagram.com/test', label: 'Instagram' },
      ];
      const result = sanitizeSocialLinks(input);
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        service: 'x',
        url: 'https://x.com/test',
        label: 'Twitter',
        sortOrder: 0,
      });
    });

    it('無効なオブジェクトをフィルタリングする', () => {
      const input = [
        { service: 'x', url: 'https://x.com/test', label: 'Twitter' },
        null,
        undefined,
        { service: 'instagram', url: 'https://instagram.com/test', label: 'Instagram' },
        { invalid: 'data' },
      ];
      const result = sanitizeSocialLinks(input);
      expect(result).toHaveLength(2);
    });

    it('空のURLをフィルタリングする', () => {
      const input = [
        { service: 'x', url: 'https://x.com/test', label: 'Twitter' },
        { service: 'instagram', url: '', label: 'Instagram' },
        { service: 'youtube', url: 'https://youtube.com/test', label: 'YouTube' },
      ];
      const result = sanitizeSocialLinks(input);
      expect(result).toHaveLength(2);
      expect(result[0].service).toBe('x');
      expect(result[1].service).toBe('youtube');
    });

    it('空のラベルをフィルタリングする', () => {
      const input = [
        { service: 'x', url: 'https://x.com/test', label: 'Twitter' },
        { service: 'instagram', url: 'https://instagram.com/test', label: '' },
        { service: 'youtube', url: 'https://youtube.com/test', label: 'YouTube' },
      ];
      const result = sanitizeSocialLinks(input);
      expect(result).toHaveLength(2);
      expect(result[0].service).toBe('x');
      expect(result[1].service).toBe('youtube');
    });

    it('空白のみのURLをフィルタリングする', () => {
      const input = [
        { service: 'x', url: 'https://x.com/test', label: 'Twitter' },
        { service: 'instagram', url: '   ', label: 'Instagram' },
      ];
      const result = sanitizeSocialLinks(input);
      expect(result).toHaveLength(1);
      expect(result[0].service).toBe('x');
    });

    it('空白のみのラベルをフィルタリングする', () => {
      const input = [
        { service: 'x', url: 'https://x.com/test', label: 'Twitter' },
        { service: 'instagram', url: 'https://instagram.com/test', label: '   ' },
      ];
      const result = sanitizeSocialLinks(input);
      expect(result).toHaveLength(1);
      expect(result[0].service).toBe('x');
    });

    it('URLとラベルの前後の空白をトリムする', () => {
      const input = [
        { service: 'x', url: '  https://x.com/test  ', label: '  Twitter  ' },
      ];
      const result = sanitizeSocialLinks(input);
      expect(result[0].url).toBe('https://x.com/test');
      expect(result[0].label).toBe('Twitter');
    });

    it('無効なサービス名をotherに正規化する', () => {
      const input = [
        { service: 'invalid', url: 'https://test.com', label: 'Test' },
      ];
      const result = sanitizeSocialLinks(input);
      expect(result[0].service).toBe('other');
    });

    it('sortOrderを正しく設定する', () => {
      const input = [
        { service: 'x', url: 'https://x.com/test', label: 'Twitter' },
        { service: 'instagram', url: 'https://instagram.com/test', label: 'Instagram' },
        { service: 'youtube', url: 'https://youtube.com/test', label: 'YouTube' },
      ];
      const result = sanitizeSocialLinks(input);
      expect(result[0].sortOrder).toBe(0);
      expect(result[1].sortOrder).toBe(1);
      expect(result[2].sortOrder).toBe(2);
    });
  });

  describe('sanitizeProfileData', () => {
    it('ユーザー自身の音声オブジェクトキーを保持する', () => {
      const result = sanitizeProfileData({
        userId: 'testuser',
        audioKey: 'audio/testuser/voice.m4a',
      });

      expect(result.error).toBeNull();
      expect(result.data?.audioKey).toBe('audio/testuser/voice.m4a');
    });

    it('別ユーザー領域の音声オブジェクトキーを拒否する', () => {
      const result = sanitizeProfileData({
        userId: 'testuser',
        audioKey: 'audio/other/voice.m4a',
      });

      expect(result.data).toBeNull();
      expect(result.error).toEqual({
        field: 'audioKey',
        message: 'Invalid audio object key.',
      });
    });

    it('正常なプロフィールデータはエラーを返さない', () => {
      const input = {
        userId: 'testuser',
        displayName: 'テストユーザー',
        bio: 'テスト自己紹介',
        audioTitle: 'テスト音声',
        theme: 'normal',
        sns: [
          { service: 'x', url: 'https://x.com/test', label: 'Twitter' },
        ],
      };
      const result = sanitizeProfileData(input);
      expect(result.error).toBeNull();
      expect(result.data).not.toBeNull();
      expect(result.data?.userId).toBe('testuser');
      expect(result.data?.displayName).toBe('テストユーザー');
    });

    it('無効なuserIdはエラーを返す', () => {
      const input = {
        userId: 'test@user',
        displayName: 'テストユーザー',
      };
      const result = sanitizeProfileData(input);
      expect(result.error).toEqual({
        field: 'userId',
        message: 'userId must only contain letters, numbers, hyphen, and underscore.',
      });
      expect(result.data).toBeNull();
    });

    it('空のuserIdはエラーを返す', () => {
      const input = {
        userId: '',
        displayName: 'テストユーザー',
      };
      const result = sanitizeProfileData(input);
      expect(result.error).toEqual({
        field: 'userId',
        message: 'userId is required',
      });
      expect(result.data).toBeNull();
    });

    it('表示名が文字数制限を超える場合はエラーを返す', () => {
      const input = {
        userId: 'testuser',
        displayName: 'a'.repeat(21),
      };
      const result = sanitizeProfileData(input);
      expect(result.error).toEqual({
        field: 'displayName',
        message: '表示名は20文字までです。',
      });
      expect(result.data).toBeNull();
    });

    it('自己紹介が文字数制限を超える場合はエラーを返す', () => {
      const input = {
        userId: 'testuser',
        displayName: 'テストユーザー',
        bio: 'a'.repeat(61),
      };
      const result = sanitizeProfileData(input);
      expect(result.error).toEqual({
        field: 'bio',
        message: '自己紹介は60文字までです。',
      });
      expect(result.data).toBeNull();
    });

    it('音声タイトルが文字数制限を超える場合はエラーを返す', () => {
      const input = {
        userId: 'testuser',
        displayName: 'テストユーザー',
        audioTitle: 'a'.repeat(26),
      };
      const result = sanitizeProfileData(input);
      expect(result.error).toEqual({
        field: 'audioTitle',
        message: '音声タイトルは25文字までです。',
      });
      expect(result.data).toBeNull();
    });

    it('SNSラベルが文字数制限を超える場合はエラーを返す', () => {
      const input = {
        userId: 'testuser',
        displayName: 'テストユーザー',
        sns: [
          { service: 'x', url: 'https://x.com/test', label: 'a'.repeat(26) },
        ],
      };
      const result = sanitizeProfileData(input);
      expect(result.error).toEqual({
        field: 'sns',
        message: 'SNSラベルは25文字までです。',
      });
      expect(result.data).toBeNull();
    });

    it('無効なURL形式はエラーを返す', () => {
      const input = {
        userId: 'testuser',
        displayName: 'テストユーザー',
        sns: [
          { service: 'x', url: 'not-a-url', label: 'Twitter' },
        ],
      };
      const result = sanitizeProfileData(input);
      expect(result.error).toEqual({
        field: 'sns',
        message: '無効なURL形式です。',
      });
      expect(result.data).toBeNull();
    });

    it('空のURLはフィルタリングされる', () => {
      const input = {
        userId: 'testuser',
        displayName: 'テストユーザー',
        sns: [
          { service: 'x', url: '', label: 'Twitter' },
        ],
      };
      const result = sanitizeProfileData(input);
      expect(result.error).toBeNull();
      expect(result.data?.sns).toEqual([]);
    });

    it('displayNameが空の場合はuserIdを使用する', () => {
      const input = {
        userId: 'testuser',
        displayName: '',
      };
      const result = sanitizeProfileData(input);
      expect(result.error).toBeNull();
      expect(result.data?.displayName).toBe('testuser');
    });

    it('無効なテーマはnormalに正規化される', () => {
      const input = {
        userId: 'testuser',
        displayName: 'テストユーザー',
        theme: 'invalid',
      };
      const result = sanitizeProfileData(input);
      expect(result.error).toBeNull();
      expect(result.data?.theme).toBe('normal');
    });

    it('空のSNS配列は正常に処理される', () => {
      const input = {
        userId: 'testuser',
        displayName: 'テストユーザー',
        sns: [],
      };
      const result = sanitizeProfileData(input);
      expect(result.error).toBeNull();
      expect(result.data?.sns).toEqual([]);
    });

    it('undefinedのSNSは空配列として処理される', () => {
      const input = {
        userId: 'testuser',
        displayName: 'テストユーザー',
        sns: undefined,
      };
      const result = sanitizeProfileData(input);
      expect(result.error).toBeNull();
      expect(result.data?.sns).toEqual([]);
    });

    it('userIdの前後の空白はトリムされる', () => {
      const input = {
        userId: '  testuser  ',
        displayName: 'テストユーザー',
      };
      const result = sanitizeProfileData(input);
      expect(result.error).toBeNull();
      expect(result.data?.userId).toBe('testuser');
    });

    it('displayNameの前後の空白はトリムされる', () => {
      const input = {
        userId: 'testuser',
        displayName: '  テストユーザー  ',
      };
      const result = sanitizeProfileData(input);
      expect(result.error).toBeNull();
      expect(result.data?.displayName).toBe('テストユーザー');
    });

    it('SNSリンクが4個を超える場合はエラーを返す', () => {
      const input = {
        userId: 'testuser',
        displayName: 'テストユーザー',
        sns: [
          { service: 'x', url: 'https://x.com/1', label: 'L1' },
          { service: 'x', url: 'https://x.com/2', label: 'L2' },
          { service: 'x', url: 'https://x.com/3', label: 'L3' },
          { service: 'x', url: 'https://x.com/4', label: 'L4' },
          { service: 'x', url: 'https://x.com/5', label: 'L5' },
        ],
      };
      const result = sanitizeProfileData(input);
      expect(result.error).toEqual({
        field: 'sns',
        message: 'SNSリンクは最大4個までです。',
      });
      expect(result.data).toBeNull();
    });

    it('bioとaudioTitleの前後の空白や改行はトリムされる', () => {
      const input = {
        userId: 'testuser',
        displayName: 'テストユーザー',
        bio: '  自己紹介の前後スペース  \n',
        audioTitle: '  音声タイトル  ',
      };
      const result = sanitizeProfileData(input);
      expect(result.error).toBeNull();
      expect(result.data?.bio).toBe('自己紹介の前後スペース');
      expect(result.data?.audioTitle).toBe('音声タイトル');
    });
  });
});
