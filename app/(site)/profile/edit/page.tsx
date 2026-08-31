"use client";

import { useEffect, useState, type ChangeEvent, type DragEvent } from "react";
import type {
  ModerationCase,
  ProfileData,
  SocialLink,
  SocialService,
} from "@/lib/mock/profileData";
import UserIdRedirect from "@/components/auth/UserIdRedirect";
import {
  validateDisplayName,
  validateBio,
  validateAudioTitle,
  validateSocialLabel,
  validateSocialUrl,
  validateProfile,
} from "@/lib/validation";
import { supabase } from "@/lib/supabaseClient";
import { OTO_MEISHI_USER_ID_KEY } from "@/lib/storageKeys";
import {
  AUDIO_FILE_ACCEPT,
  AUDIO_UPLOAD_REQUIREMENTS,
  MAX_AUDIO_FILE_SIZE_BYTES,
  MAX_AUDIO_FILE_SIZE_MEGABYTES,
} from "@/lib/audioUploadConstraints";
import styles from "./page.module.css";
import AudioPlayer from "@/components/card/audioPlayer/AudioPlayer";
import Card from "@/components/card/Card";
import IdentityVerificationRequestPanel from "@/components/moderation/IdentityVerificationRequestPanel";

const themeOptions = [
  { value: "normal", label: "標準" },
  { value: "dark", label: "ダーク" },
  { value: "light", label: "ライト" },
  { value: "colorful", label: "カラフル" },
] as const;

const serviceOptions: Array<{ value: SocialService; label: string }> = [
  { value: "x", label: "X" },
  { value: "instagram", label: "Instagram" },
  { value: "youtube", label: "YouTube" },
  { value: "tiktok", label: "TikTok" },
  { value: "github", label: "GitHub" },
  { value: "discord", label: "Discord" },
  { value: "facebook", label: "Facebook" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "bluesky", label: "Bluesky" },
  { value: "threads", label: "Threads" },
  { value: "note", label: "Note" },
  { value: "website", label: "Webサイト" },
  { value: "other", label: "その他" },
];

const serviceUrlPlaceholders: Record<SocialService, string> = {
  x: "https://x.com/yourname",
  instagram: "https://www.instagram.com/yourname",
  youtube: "https://www.youtube.com/@yourname",
  tiktok: "https://www.tiktok.com/@yourname",
  github: "https://github.com/yourname",
  discord: "https://discord.gg/invite-code",
  facebook: "https://www.facebook.com/yourname",
  linkedin: "https://www.linkedin.com/in/yourname",
  bluesky: "https://bsky.app/profile/yourname.bsky.social",
  threads: "https://www.threads.net/@yourname",
  note: "https://note.com/yourname",
  website: "https://example.com",
  other: "https://example.com",
};

type SaveState = "idle" | "saving" | "success" | "error";

const moderationReasonLabels: Record<ModerationCase["reasonCode"], string> = {
  inappropriateContent: "不適切な内容",
  copyrightConcern: "著作権に関する問題",
  harassment: "誹謗中傷",
  unsafeLink: "安全でないリンク",
  serviceMismatch: "選択したサービスとURLの不一致",
  impersonation: "なりすまし",
  threatOrPersonalData: "脅迫・第三者の個人情報",
  unofficialThirdPartyProfile: "他人を主体としたプロフィール",
  politicalReligiousPromotion: "政治・宗教への勧誘・宣伝",
  other: "その他の問題",
};

const moderationStatusLabels: Record<ModerationCase["status"], string> = {
  correctionRequired: "非公開・修正が必要",
  postReviewPending: "管理者確認待ち（非公開）",
  preReviewPending: "管理者確認待ち（非公開）",
  confirmed: "確認済み",
};

function ModerationNotice({
  moderationCase,
}: {
  moderationCase: ModerationCase;
}) {
  const guidance =
    moderationCase.status === "confirmed"
      ? "管理者による確認は完了しています。"
      : moderationCase.reasonCode === "impersonation" &&
          moderationCase.targetType === "profile"
        ? "なりすましへの対応では、表示名・自己紹介・テーマと、登録済みの音声・リンクをすべて変更または削除してください。すべての修正を管理者が確認するまで公開されません。"
        : "問題の箇所を変更しても、管理者の確認が完了するまで公開されません。";

  return (
    <aside className={styles.moderationNotice} role="status">
      <div className={styles.moderationNoticeHeader}>
        <strong>{moderationStatusLabels[moderationCase.status]}</strong>
        <span>{moderationReasonLabels[moderationCase.reasonCode]}</span>
      </div>
      <p>{moderationCase.userMessage}</p>
      <p>{guidance}</p>
    </aside>
  );
}

function getAudioUploadErrorMessage(
  status: number,
  response: { error?: unknown },
): string {
  if (status === 401) {
    return "セッションの有効期限が切れました。再度ログインしてください。";
  }
  if (status === 403) {
    return "このプロフィールの音声を変更する権限がありません。";
  }
  if (status === 404) {
    return "プロフィールが見つかりません。";
  }
  if (status === 413) {
    return `音声ファイルは${MAX_AUDIO_FILE_SIZE_MEGABYTES}MB以下にしてください。`;
  }
  if (status === 422 && typeof response.error === "string") {
    return response.error;
  }
  return "音声のアップロードに失敗しました。時間をおいて再度お試しください。";
}

type ProfileSaveControlsProps = {
  state: SaveState;
  message: string;
  onSave: () => void;
  className?: string | null;
};

function ProfileSaveControls({
  state,
  message,
  onSave,
  className = styles.saveButtonRow,
}: ProfileSaveControlsProps) {
  const content = (
    <>
      <button
        type="button"
        className={styles.saveButton}
        onClick={onSave}
        disabled={state === "saving"}
      >
        {state === "saving" ? "保存中..." : "変更を保存"}
      </button>
      {message ? (
        <p
          className={`${styles.saveMessage} ${
            state === "success"
              ? styles.saveMessageSuccess
              : styles.saveMessageError
          }`}
        >
          {message}
        </p>
      ) : null}
    </>
  );

  return className ? <div className={className}>{content}</div> : content;
}

type ValidatedFieldLabelProps = {
  htmlFor: string;
  label: string;
  error?: string;
  className?: string;
};

function ValidatedFieldLabel({
  htmlFor,
  label,
  error,
  className = styles.label,
}: ValidatedFieldLabelProps) {
  return (
    <div className={styles.labelWithValidation}>
      <label className={className} htmlFor={htmlFor}>
        {label}
      </label>
      {error ? <span className={styles.validationError}>{error}</span> : null}
    </div>
  );
}

export default function ProfileEditPage() {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioPreviewUrl, setAudioPreviewUrl] = useState<string>("");
  const [dragActive, setDragActive] = useState(false);
  const [loading, setLoading] = useState(() => {
    if (typeof window === "undefined") {
      return true;
    }
    return Boolean(window.localStorage.getItem(OTO_MEISHI_USER_ID_KEY));
  });
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveMessage, setSaveMessage] = useState<string>("");
  const [audioUploadMessages, setAudioUploadMessages] = useState<string[]>([]);
  const [audioFileError, setAudioFileError] = useState<string>("");
  const [deletingAudio, setDeletingAudio] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewMode, setPreviewMode] = useState<"desktop" | "mobile">(
    "desktop",
  );
  const [validationErrors, setValidationErrors] = useState<{
    displayName?: string;
    bio?: string;
    audioTitle?: string;
    socialLinks?: Record<number, { label?: string; url?: string }>;
  }>({});

  useEffect(() => {
    const savedUserId = window.localStorage.getItem(OTO_MEISHI_USER_ID_KEY);
    if (!savedUserId) {
      return;
    }

    const loadProfile = async () => {
      try {
        if (!supabase) {
          throw new Error("認証クライアントが初期化されていません。");
        }

        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session) {
          throw new Error("セッションがありません。ログインしてください。");
        }

        const response = await fetch("/api/profile?mine=true", {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (!response.ok) {
          const errorResponse = await response.json();
          throw new Error(
            errorResponse.error || "プロフィールの取得に失敗しました。",
          );
        }

        const profileResponse = await response.json();
        setProfile(profileResponse as ProfileData);
        if (profileResponse.audioKey || profileResponse.audioUrl) {
          setAudioUploadMessages(["音源を変更できます"]);
        }
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "プロフィールの取得に失敗しました。",
        );
      } finally {
        setLoading(false);
      }
    };

    const timeoutId = window.setTimeout(() => void loadProfile(), 0);
    return () => window.clearTimeout(timeoutId);
  }, []);

  useEffect(() => {
    return () => {
      if (audioPreviewUrl) URL.revokeObjectURL(audioPreviewUrl);
    };
  }, [audioPreviewUrl]);

  useEffect(() => {
    if (!previewOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPreviewOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [previewOpen]);

  const updateField = (field: keyof ProfileData, value: string) => {
    setProfile((current) =>
      current ? { ...current, [field]: value } : current,
    );

    // 表示名の文字数制限チェック
    if (field === "displayName") {
      setValidationErrors((prev) => ({
        ...prev,
        displayName: validateDisplayName(value),
      }));
    }

    // 自己紹介の文字数制限チェック
    if (field === "bio") {
      setValidationErrors((prev) => ({
        ...prev,
        bio: validateBio(value),
      }));
    }

    // 音声タイトルの文字数制限チェック
    if (field === "audioTitle") {
      setValidationErrors((prev) => ({
        ...prev,
        audioTitle: validateAudioTitle(value),
      }));
    }
  };

  const updateSocialLink = (
    index: number,
    field: keyof SocialLink,
    value: string,
  ) => {
    setProfile((current) => {
      if (!current) return current;
      const next = [...current.sns];
      next[index] = { ...next[index], [field]: value };

      // SNSラベルの文字数制限チェック
      if (field === "label") {
        setValidationErrors((prev) => ({
          ...prev,
          socialLinks: {
            ...prev.socialLinks,
            [index]: {
              ...prev.socialLinks?.[index],
              label: validateSocialLabel(
                value,
                Boolean(next[index].url.trim()),
              ),
            },
          },
        }));
      }

      if (field === "url") {
        setValidationErrors((prev) => ({
          ...prev,
          socialLinks: {
            ...prev.socialLinks,
            [index]: {
              ...prev.socialLinks?.[index],
              url: validateSocialUrl(value),
              label: validateSocialLabel(
                next[index].label,
                Boolean(value.trim()),
              ),
            },
          },
        }));
      }

      return { ...current, sns: next };
    });
  };

  const handleAudioFile = (file: File): boolean => {
    if (file.size === 0) {
      setAudioFileError("空の音声ファイルは選択できません。");
      return false;
    }

    if (file.size > MAX_AUDIO_FILE_SIZE_BYTES) {
      setAudioFileError(
        `音声ファイルは${MAX_AUDIO_FILE_SIZE_MEGABYTES}MB以下にしてください。`,
      );
      return false;
    }

    setAudioFileError("");
    setAudioFile(file);
    setAudioPreviewUrl((previousUrl) => {
      if (previousUrl) URL.revokeObjectURL(previousUrl);
      return URL.createObjectURL(file);
    });
    setAudioUploadMessages([
      `変更を保存ボタンで${file.name}をアップできます`,
      "（音源はサーバー側でAACファイルに変換されます）",
    ]);
    return true;
  };

  const handleAudioInput = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && !handleAudioFile(file)) {
      event.target.value = "";
    }
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragActive(true);
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragActive(false);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragActive(false);
    const file = event.dataTransfer.files?.[0];
    if (file) handleAudioFile(file);
  };

  const handleDeleteAudio = async () => {
    if (!profile || deletingAudio) return;
    if (
      !window.confirm("登録中の音源を削除しますか？この操作は取り消せません。")
    ) {
      return;
    }

    if (!supabase) {
      setAudioFileError("認証クライアントが初期化されていません。");
      return;
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      setAudioFileError("セッションがありません。ログインしてください。");
      return;
    }

    setDeletingAudio(true);
    setAudioFileError("");
    try {
      const response = await fetch("/api/audio", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.error || "音源の削除に失敗しました。");
      }

      setAudioFile(null);
      setAudioPreviewUrl((previousUrl) => {
        if (previousUrl) URL.revokeObjectURL(previousUrl);
        return "";
      });
      setProfile((current) =>
        current
          ? { ...current, audioUrl: "", audioKey: "", audioTitle: "" }
          : current,
      );
      setValidationErrors((current) => ({ ...current, audioTitle: undefined }));
      setAudioUploadMessages([]);
    } catch (error) {
      setAudioFileError(
        error instanceof Error ? error.message : "音源の削除に失敗しました。",
      );
    } finally {
      setDeletingAudio(false);
    }
  };

  const addSocialLink = () => {
    setProfile((current) => {
      if (!current || current.sns.length >= 4) return current;
      return {
        ...current,
        sns: [...current.sns, { service: "other", url: "", label: "" }],
      };
    });
  };

  const removeSocialLink = (index: number) => {
    setProfile((current) =>
      current
        ? { ...current, sns: current.sns.filter((_, i) => i !== index) }
        : current,
    );
  };

  const handleSave = async () => {
    if (!profile) return;

    const profileErrors = validateProfile(profile);
    setValidationErrors({
      displayName: profileErrors.displayName,
      bio: profileErrors.bio,
      audioTitle: profileErrors.audioTitle,
      socialLinks: profileErrors.sns,
    });
    if (Object.keys(profileErrors).length > 0) {
      setSaveState("error");
      setSaveMessage("入力内容を確認してください。");
      return;
    }

    const savedUserId = window.localStorage.getItem(OTO_MEISHI_USER_ID_KEY);
    if (!savedUserId) {
      setSaveState("error");
      setSaveMessage("ユーザーIDが設定されていません。");
      return;
    }

    if (!supabase) {
      setSaveState("error");
      setSaveMessage("認証クライアントが初期化されていません。");
      return;
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      setSaveState("error");
      setSaveMessage("セッションがありません。ログインしてください。");
      return;
    }
    const token = session.access_token;

    setSaveState("saving");
    setSaveMessage("");

    try {
      // 音声ファイルが選択されている場合は先にアップロード
      let finalAudioUrl = profile.audioUrl;
      let finalAudioKey = profile.audioKey || "";
      if (audioFile) {
        if (audioFile.size > MAX_AUDIO_FILE_SIZE_BYTES) {
          const message = `音声ファイルは${MAX_AUDIO_FILE_SIZE_MEGABYTES}MB以下にしてください。`;
          setAudioFileError(message);
          throw new Error(message);
        }

        const formData = new FormData();
        formData.append("file", audioFile);
        formData.append("userId", savedUserId);

        const uploadResponse = await fetch("/api/audio/upload", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body: formData,
        });

        const uploadResult = await uploadResponse.json().catch(() => ({}));

        if (!uploadResponse.ok) {
          throw new Error(
            getAudioUploadErrorMessage(uploadResponse.status, uploadResult),
          );
        }

        finalAudioUrl = "";
        finalAudioKey = uploadResult.audioKey;
        setAudioUploadMessages(["音源をアップロードしました"]);
      }

      const response = await fetch("/api/profile", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          ...profile,
          audioUrl: finalAudioUrl,
          audioKey: finalAudioKey,
          userId: savedUserId,
        }),
      });

      const savedProfileResponse = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(savedProfileResponse.error || "保存に失敗しました。");
      }

      setProfile(savedProfileResponse as ProfileData);
      setAudioFile(null);
      setAudioPreviewUrl((previousUrl) => {
        if (previousUrl) URL.revokeObjectURL(previousUrl);
        return "";
      });
      setSaveState("success");
      setSaveMessage("プロフィールを保存しました。");
    } catch (err) {
      setSaveState("error");
      setSaveMessage(
        err instanceof Error ? err.message : "保存に失敗しました。",
      );
    }
  };

  const socialLinks = profile?.sns ?? [];
  const profileModerationCase = profile?.moderationCases?.find(
    (moderationCase) => moderationCase.targetType === "profile",
  );
  const audioModerationCase = profile?.moderationCases?.find(
    (moderationCase) => moderationCase.targetType === "audio",
  );
  const identityVerificationCases =
    profile?.moderationCases?.filter(
      (moderationCase) =>
        moderationCase.reasonCode === "impersonation" &&
        moderationCase.status !== "confirmed",
    ) ?? [];
  const previewProfile: ProfileData | null = profile
    ? {
        ...profile,
        hasAudio: Boolean(
          audioPreviewUrl || profile.audioKey || profile.audioUrl,
        ),
        sns: profile.sns.filter(
          (link) =>
            link.status !== "hidden" &&
            Boolean(link.label.trim()) &&
            Boolean(link.url.trim()),
        ),
      }
    : null;

  return (
    <section className={styles.main}>
      <UserIdRedirect />

      <section className={styles.pageSection}>
        {loading ? (
          <p className={styles.loading}>読み込み中...</p>
        ) : error ? (
          <p className={styles.error}>{error}</p>
        ) : !profile ? (
          <p className={styles.error}>ユーザーIDが設定されていません。</p>
        ) : (
          <>
            <ProfileSaveControls
              state={saveState}
              message={saveMessage}
              onSave={handleSave}
              className={styles.stickySaveControls}
            />
            <article
              className={`${styles.cardEditor} ${styles[profile.theme]}`}
            >
              <div className={styles.cardTopBar}>
                <div>
                  <p className={styles.cardBadge}>編集モード</p>
                </div>
                <div className={styles.actionsRow}>
                  <button
                    type="button"
                    className={styles.previewButton}
                    onClick={() => setPreviewOpen(true)}
                  >
                    公開表示をプレビュー
                  </button>
                  <div className={styles.themeOptions}>
                    {themeOptions.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        className={`${styles.themeButton} ${
                          profile.theme === option.value ? styles.active : ""
                        }`}
                        onClick={() => updateField("theme", option.value)}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className={styles.cardBody}>
                {profileModerationCase ? (
                  <ModerationNotice moderationCase={profileModerationCase} />
                ) : null}
                {identityVerificationCases.length ? (
                  <IdentityVerificationRequestPanel
                    moderationCases={identityVerificationCases}
                    socialLinks={socialLinks}
                  />
                ) : null}

                <div className={styles.fieldRow}>
                  <ValidatedFieldLabel
                    htmlFor="displayName"
                    label="表示名"
                    error={validationErrors.displayName}
                  />
                  <input
                    id="displayName"
                    className={styles.titleInput}
                    type="text"
                    value={profile.displayName}
                    onChange={(event) =>
                      updateField("displayName", event.target.value)
                    }
                  />
                </div>

                <div className={styles.fieldRow}>
                  <ValidatedFieldLabel
                    htmlFor="bio"
                    label="自己紹介"
                    error={validationErrors.bio}
                  />
                  <textarea
                    id="bio"
                    className={styles.bioInput}
                    value={profile.bio}
                    onChange={(event) => updateField("bio", event.target.value)}
                  />
                </div>

                <div className={styles.audioGroup}>
                  {audioModerationCase ? (
                    <ModerationNotice moderationCase={audioModerationCase} />
                  ) : null}
                  <div className={styles.audioField}>
                    <ValidatedFieldLabel
                      htmlFor="audioTitle"
                      label="音声タイトル"
                      error={validationErrors.audioTitle}
                    />
                    <input
                      id="audioTitle"
                      className={styles.input}
                      type="text"
                      value={profile.audioTitle}
                      onChange={(event) =>
                        updateField("audioTitle", event.target.value)
                      }
                    />
                  </div>
                  <div className={styles.audioField}>
                    <label className={styles.label} htmlFor="audioFile">
                      音声ファイル
                    </label>
                    <div
                      className={`${styles.uploadZone} ${
                        dragActive ? styles.uploadZoneActive : ""
                      }`}
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onDrop={handleDrop}
                    >
                      <input
                        id="audioFile"
                        type="file"
                        accept={AUDIO_FILE_ACCEPT}
                        className={styles.hiddenFileInput}
                        onChange={handleAudioInput}
                      />
                      <label
                        htmlFor="audioFile"
                        className={styles.uploadZoneLabel}
                      >
                        <p className={styles.uploadLabel}>
                          ここに音声ファイルをドロップ、またはクリックして選択
                        </p>
                        <p className={styles.uploadHint}>
                          {(audioUploadMessages.length > 0
                            ? audioUploadMessages
                            : [
                                audioFile?.name ||
                                  (profile.audioKey || profile.audioUrl
                                    ? "音源を登録済み"
                                    : "未選択"),
                              ]
                          ).map((line, index, lines) => (
                            <span key={`${line}-${index}`}>
                              {line}
                              {index < lines.length - 1 ? <br /> : null}
                            </span>
                          ))}
                        </p>
                      </label>
                    </div>
                    <p className={styles.uploadRequirements}>
                      {AUDIO_UPLOAD_REQUIREMENTS}
                    </p>
                    {audioFileError ? (
                      <p className={styles.audioFileError} role="alert">
                        {audioFileError}
                      </p>
                    ) : null}
                    {(audioPreviewUrl ||
                      profile.audioKey ||
                      profile.audioUrl) && (
                      <div className={styles.audioPreview}>
                        {audioPreviewUrl ? (
                          <audio
                            controls
                            className={styles.audioPlayer}
                            src={audioPreviewUrl}
                          />
                        ) : (
                          <AudioPlayer
                            userId={profile.userId}
                            audioTitle={profile.audioTitle}
                          />
                        )}
                        {profile.audioKey || profile.audioUrl ? (
                          <button
                            type="button"
                            className={styles.deleteAudioButton}
                            onClick={handleDeleteAudio}
                            disabled={deletingAudio}
                          >
                            {deletingAudio ? "削除中..." : "音源を削除"}
                          </button>
                        ) : null}
                      </div>
                    )}
                  </div>
                </div>

                <div className={styles.sectionHeader}>
                  <h3 className={styles.sectionTitle}>サービスリンク</h3>
                </div>

                <div className={styles.socialList}>
                  {socialLinks.map((link, index) => (
                    <div
                      key={link.id ?? `${link.service}-${index}`}
                      className={styles.socialRow}
                    >
                      {profile.moderationCases
                        ?.filter(
                          (moderationCase) =>
                            moderationCase.targetType === "socialLink" &&
                            moderationCase.targetId === link.id,
                        )
                        .map((moderationCase) => (
                          <ModerationNotice
                            key={moderationCase.id}
                            moderationCase={moderationCase}
                          />
                        ))}
                      <div className={styles.serviceRow}>
                        <label
                          className={styles.smallLabel}
                          htmlFor={`service-${index}`}
                        >
                          サービス
                        </label>
                        <select
                          id={`service-${index}`}
                          className={`${styles.select} ${styles.smallInput}`}
                          value={link.service}
                          onChange={(event) =>
                            updateSocialLink(
                              index,
                              "service",
                              event.target.value,
                            )
                          }
                        >
                          {serviceOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className={styles.serviceRow}>
                        <ValidatedFieldLabel
                          htmlFor={`label-${index}`}
                          label="ラベル"
                          error={validationErrors.socialLinks?.[index]?.label}
                          className={styles.smallLabel}
                        />
                        <input
                          id={`label-${index}`}
                          className={`${styles.input} ${styles.smallInput}`}
                          type="text"
                          placeholder="リンクを追加"
                          value={link.label}
                          onChange={(event) =>
                            updateSocialLink(index, "label", event.target.value)
                          }
                        />
                      </div>

                      <div className={styles.serviceRow}>
                        <ValidatedFieldLabel
                          htmlFor={`url-${index}`}
                          label="URL"
                          error={validationErrors.socialLinks?.[index]?.url}
                          className={styles.smallLabel}
                        />
                        <input
                          id={`url-${index}`}
                          className={`${styles.input} ${styles.smallInput}`}
                          type="url"
                          placeholder={serviceUrlPlaceholders[link.service]}
                          value={link.url}
                          onChange={(event) =>
                            updateSocialLink(index, "url", event.target.value)
                          }
                        />
                      </div>

                      <button
                        type="button"
                        className={styles.removeButton}
                        onClick={() => removeSocialLink(index)}
                      >
                        削除
                      </button>
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  className={styles.addButton}
                  onClick={addSocialLink}
                  disabled={socialLinks.length >= 4}
                >
                  + リンクを追加
                </button>
              </div>
              {previewOpen && previewProfile ? (
                <div
                  className={styles.previewBackdrop}
                  onMouseDown={(event) => {
                    if (event.target === event.currentTarget) {
                      setPreviewOpen(false);
                    }
                  }}
                >
                  <section
                    className={styles.previewDialog}
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="profile-preview-title"
                  >
                    <header className={styles.previewHeader}>
                      <div>
                        <p className={styles.previewEyebrow}>
                          保存前プレビュー
                        </p>
                        <h2 id="profile-preview-title">公開プロフィール表示</h2>
                        <p>この操作では変更内容は保存されません。</p>
                      </div>
                      <button
                        type="button"
                        className={styles.previewCloseButton}
                        onClick={() => setPreviewOpen(false)}
                        autoFocus
                      >
                        閉じる
                      </button>
                    </header>
                    <div
                      className={styles.previewModeSelector}
                      aria-label="プレビュー表示幅"
                    >
                      <button
                        type="button"
                        aria-pressed={previewMode === "desktop"}
                        onClick={() => setPreviewMode("desktop")}
                      >
                        PC表示
                      </button>
                      <button
                        type="button"
                        aria-pressed={previewMode === "mobile"}
                        onClick={() => setPreviewMode("mobile")}
                      >
                        スマートフォン表示
                      </button>
                    </div>
                    <div className={styles.previewViewport}>
                      <div
                        className={`${styles.previewCanvas} ${
                          previewMode === "mobile"
                            ? styles.previewCanvasMobile
                            : styles.previewCanvasDesktop
                        }`}
                      >
                        <Card
                          link={previewProfile}
                          previewAudioUrl={audioPreviewUrl}
                          displayMode={
                            previewMode === "mobile" ? "mobile" : "responsive"
                          }
                        />
                      </div>
                    </div>
                  </section>
                </div>
              ) : null}
            </article>
          </>
        )}
      </section>
    </section>
  );
}
