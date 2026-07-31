import type { SocialLink, SocialService } from "./mock/profileData";

const allowedThemes = ["normal", "dark", "light", "colorful"] as const;
type ProfileTheme = (typeof allowedThemes)[number];
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
  theme: ProfileTheme;
  bio: string;
  audioUrl: string;
  audioKey: string;
  audioTitle: string;
  sns: Array<{
    id?: string;
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
export function normalizeTheme(theme: string): ProfileTheme {
  return allowedThemes.includes(theme as ProfileTheme)
    ? (theme as ProfileTheme)
    : "normal";
}

/**
 * URLフォーマットのバリデーション
 */
export function validateUrlFormat(url: string): ApiValidationError | null {
  if (!url) {
    return { field: "sns", message: "URLは必須です。" };
  }

  try {
    const parsedUrl = new URL(url);
    if (parsedUrl.protocol !== "https:") {
      return {
        field: "sns",
        message: "URLはhttps://から入力してください。",
      };
    }
    return null;
  } catch {
    return { field: "sns", message: "無効なURL形式です。" };
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
export function sanitizeSocialLinks(socialLinks: unknown[]): Array<{
  id?: string;
  service: SocialService;
  url: string;
  label: string;
  sortOrder: number;
}> {
  return socialLinks
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
        ...(typeof (link as { id?: unknown }).id === "string" &&
        (link as { id: string }).id.trim()
          ? { id: (link as { id: string }).id.trim() }
          : {}),
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
    audioKey?: string;
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
  const audioKey = typeof body.audioKey === "string" ? body.audioKey : "";
  const audioTitle = typeof body.audioTitle === "string" ? body.audioTitle.trim() : "";

  const audioKeySegments = audioKey.split("/");
  const isValidAudioKey =
    !audioKey ||
    (audioKey.startsWith(`audio/${encodeURIComponent(userId)}/`) &&
      !audioKey.includes("\\") &&
      !audioKeySegments.includes("..") &&
      audioKeySegments.every(Boolean));

  if (!isValidAudioKey) {
    return {
      data: null,
      error: { field: "audioKey", message: "Invalid audio object key." },
    };
  }

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
  const socialLinks = sanitizeSocialLinks(Array.isArray(body.sns) ? body.sns : []);

  // SNSリンクの個数制限チェック
  if (socialLinks.length > MAX_SNS_COUNT) {
    return {
      data: null,
      error: {
        field: "sns",
        message: `SNSリンクは最大${MAX_SNS_COUNT}個までです。`,
      },
    };
  }

  // SNSラベルの文字数制限チェック
  for (const link of socialLinks) {
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
      audioKey,
      audioTitle,
      sns: socialLinks,
    },
    error: null,
  };
}
