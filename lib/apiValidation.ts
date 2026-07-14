import type { ProfileData, SocialLink, SocialService } from "./mock/profileData";

const allowedThemes = ["normal", "dark", "light", "colorful"] as const;
const allowedServices: SocialService[] = [
  "x",
  "instagram",
  "youtube",
  "tiktok",
  "github",
  "discord",
  "facebook",
  "linkedin",
  "bluesky",
  "threads",
  "note",
  "website",
  "other",
];

// 文字数制限
const MAX_DISPLAY_NAME_LENGTH = 20;
const MAX_BIO_LENGTH = 60;
const MAX_AUDIO_TITLE_LENGTH = 25;
const MAX_SOCIAL_LABEL_LENGTH = 25;
const MAX_SNS_COUNT = 4;

export interface ApiValidationError {
  field?: string;
  message: string;
}

export interface SanitizedProfileData {
  userId: string;
  displayName: string;
  theme: string;
  bio: string;
  audioUrl: string;
  audioTitle: string;
  sns: Array<{
    service: SocialService;
    url: string;
    label: string;
    sortOrder: number;
  }>;
}

/**
 * ユーザーIDのバリデーション
 */
export function validateUserId(userId: string): ApiValidationError | null {
  if (!userId) {
    return { field: "userId", message: "userId is required" };
  }

  if (!/^[a-zA-Z0-9_-]+$/.test(userId)) {
    return {
      field: "userId",
      message: "userId must only contain letters, numbers, hyphen, and underscore.",
    };
  }

  return null;
}

/**
 * 表示名のバリデーション
 */
export function validateDisplayNameLength(displayName: string): ApiValidationError | null {
  if (displayName.length > MAX_DISPLAY_NAME_LENGTH) {
    return {
      field: "displayName",
      message: `表示名は${MAX_DISPLAY_NAME_LENGTH}文字までです。`,
    };
  }
  return null;
}

/**
 * 自己紹介のバリデーション
 */
export function validateBioLength(bio: string): ApiValidationError | null {
  if (bio.length > MAX_BIO_LENGTH) {
    return {
      field: "bio",
      message: `自己紹介は${MAX_BIO_LENGTH}文字までです。`,
    };
  }
  return null;
}

/**
 * 音声タイトルのバリデーション
 */
export function validateAudioTitleLength(audioTitle: string): ApiValidationError | null {
  if (audioTitle.length > MAX_AUDIO_TITLE_LENGTH) {
    return {
      field: "audioTitle",
      message: `音声タイトルは${MAX_AUDIO_TITLE_LENGTH}文字までです。`,
    };
  }
  return null;
}

/**
 * SNSラベルのバリデーション
 */
export function validateSocialLabelLength(label: string): ApiValidationError | null {
  if (label.length > MAX_SOCIAL_LABEL_LENGTH) {
    return {
      field: "sns",
      message: `SNSラベルは${MAX_SOCIAL_LABEL_LENGTH}文字までです。`,
    };
  }
  return null;
}

/**
 * テーマのバリデーションと正規化
 */
export function normalizeTheme(theme: string): string {
  return allowedThemes.includes(theme as (typeof allowedThemes)[number])
    ? theme
    : "normal";
}

/**
 * URLフォーマットのバリデーション
 */
export function validateUrlFormat(url: string): ApiValidationError | null {
  if (!url) {
    return { field: 'sns', message: 'URLは必須です。' };
  }

  try {
    new URL(url);
    return null;
  } catch {
    return { field: 'sns', message: '無効なURL形式です。' };
  }
}

/**
 * SNSサービスのバリデーションと正規化
 */
export function normalizeSocialService(service: string): SocialService {
  return allowedServices.includes(service as SocialService)
    ? (service as SocialService)
    : "other";
}

/**
 * SNSリンクのフィルタリングと正規化
 */
export function sanitizeSocialLinks(sns: unknown[]): Array<{
  service: SocialService;
  url: string;
  label: string;
  sortOrder: number;
}> {
  return sns
    .filter(
      (link): link is SocialLink => {
        if (typeof link !== "object" || link === null) return false;
        const l = link as Record<string, unknown>;
        return (
          typeof l.url === "string" &&
          typeof l.label === "string" &&
          typeof l.service === "string" &&
          l.url.trim() !== "" &&
          l.label.trim() !== ""
        );
      }
    )
    .map((link, index) => {
      const l = link as SocialLink;
      return {
        service: normalizeSocialService(l.service),
        url: l.url.trim(),
        label: l.label.trim(),
        sortOrder: index,
      };
    });
}

/**
 * プロフィールデータのサニタイズとバリデーション
 */
export function sanitizeProfileData(
  body: {
    userId?: string;
    displayName?: string;
    theme?: string;
    bio?: string;
    audioUrl?: string;
    audioTitle?: string;
    sns?: unknown[];
  },
): { data: SanitizedProfileData | null; error: ApiValidationError | null } {
  const userId = typeof body.userId === "string" ? body.userId.trim() : "";
  const displayName =
    typeof body.displayName === "string" ? body.displayName.trim() : userId;
  const theme = normalizeTheme(typeof body.theme === "string" ? body.theme : "normal");
  const bio = typeof body.bio === "string" ? body.bio.trim() : "";
  const audioUrl = typeof body.audioUrl === "string" ? body.audioUrl : "";
  const audioTitle = typeof body.audioTitle === "string" ? body.audioTitle.trim() : "";

  // ユーザーIDのバリデーション
  const userIdError = validateUserId(userId);
  if (userIdError) {
    return { data: null, error: userIdError };
  }

  // 文字数制限チェック
  const displayNameError = validateDisplayNameLength(displayName);
  if (displayNameError) {
    return { data: null, error: displayNameError };
  }

  const bioError = validateBioLength(bio);
  if (bioError) {
    return { data: null, error: bioError };
  }

  const audioTitleError = validateAudioTitleLength(audioTitle);
  if (audioTitleError) {
    return { data: null, error: audioTitleError };
  }

  // SNSリンクのサニタイズ
  const snsPayload = sanitizeSocialLinks(Array.isArray(body.sns) ? body.sns : []);

  // SNSリンクの個数制限チェック
  if (snsPayload.length > MAX_SNS_COUNT) {
    return {
      data: null,
      error: {
        field: "sns",
        message: `SNSリンクは最大${MAX_SNS_COUNT}個までです。`,
      },
    };
  }

  // SNSラベルの文字数制限チェック
  for (const link of snsPayload) {
    const labelError = validateSocialLabelLength(link.label);
    if (labelError) {
      return { data: null, error: labelError };
    }

    // URLフォーマットのバリデーション
    const urlError = validateUrlFormat(link.url);
    if (urlError) {
      return { data: null, error: urlError };
    }
  }

  return {
    data: {
      userId,
      displayName: displayName || userId,
      theme,
      bio,
      audioUrl,
      audioTitle,
      sns: snsPayload,
    },
    error: null,
  };
}
