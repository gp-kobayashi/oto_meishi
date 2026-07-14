// 文字数制限
export const MAX_DISPLAY_NAME_LENGTH = 20;
export const MAX_BIO_LENGTH = 60;
export const MAX_AUDIO_TITLE_LENGTH = 25;
export const MAX_SOCIAL_LABEL_LENGTH = 25;

export interface ValidationError {
  displayName?: string;
  bio?: string;
  audioTitle?: string;
  sns?: Record<number, { label?: string }>;
}

export interface SocialLink {
  service: string;
  url: string;
  label: string;
}

export interface ProfileData {
  displayName: string;
  bio: string;
  audioTitle: string;
  sns: SocialLink[];
}

/**
 * 表示名の文字数制限チェック
 */
export function validateDisplayName(value: string): string | undefined {
  if (value.length > MAX_DISPLAY_NAME_LENGTH) {
    return `文字数制限を超えています（${MAX_DISPLAY_NAME_LENGTH}文字まで）`;
  }
  return undefined;
}

/**
 * 自己紹介の文字数制限チェック
 */
export function validateBio(value: string): string | undefined {
  if (value.length > MAX_BIO_LENGTH) {
    return `文字数制限を超えています（${MAX_BIO_LENGTH}文字まで）`;
  }
  return undefined;
}

/**
 * 音声タイトルの文字数制限チェック
 */
export function validateAudioTitle(value: string): string | undefined {
  if (value.length > MAX_AUDIO_TITLE_LENGTH) {
    return `文字数制限を超えています（${MAX_AUDIO_TITLE_LENGTH}文字まで）`;
  }
  return undefined;
}

/**
 * SNSラベルの文字数制限チェック
 */
export function validateSocialLabel(value: string): string | undefined {
  if (value.length > MAX_SOCIAL_LABEL_LENGTH) {
    return `文字数制限を超えています（${MAX_SOCIAL_LABEL_LENGTH}文字まで）`;
  }
  return undefined;
}

/**
 * プロフィールデータのバリデーション
 */
export function validateProfile(data: ProfileData): ValidationError {
  const errors: ValidationError = {};

  const displayNameError = validateDisplayName(data.displayName);
  if (displayNameError) {
    errors.displayName = displayNameError;
  }

  const bioError = validateBio(data.bio);
  if (bioError) {
    errors.bio = bioError;
  }

  const audioTitleError = validateAudioTitle(data.audioTitle);
  if (audioTitleError) {
    errors.audioTitle = audioTitleError;
  }

  // SNSラベルのバリデーション
  const snsErrors: Record<number, { label?: string }> = {};
  data.sns.forEach((link, index) => {
    const labelError = validateSocialLabel(link.label);
    if (labelError) {
      snsErrors[index] = { label: labelError };
    }
  });

  if (Object.keys(snsErrors).length > 0) {
    errors.sns = snsErrors;
  }

  return errors;
}
