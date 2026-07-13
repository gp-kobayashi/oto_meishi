"use client";

import { useEffect, useState, type ChangeEvent, type DragEvent } from "react";
import type {
  ProfileData,
  SocialLink,
  SocialService,
} from "../../../lib/mock/profileData";
import UserIdRedirect from "../../../components/auth/UserIdRedirect";
import styles from "./page.module.css";

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

export default function ProfileEditPage() {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioPreviewUrl, setAudioPreviewUrl] = useState<string>("");
  const [dragActive, setDragActive] = useState(false);
  const [loading, setLoading] = useState(() => {
    if (typeof window === "undefined") {
      return true;
    }
    return Boolean(window.localStorage.getItem("oto_meishi_userId"));
  });
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<
    "idle" | "saving" | "success" | "error"
  >("idle");
  const [saveMessage, setSaveMessage] = useState<string>("");
  const [audioUploadMessage, setAudioUploadMessage] = useState<string>("");

  useEffect(() => {
    const savedUserId = window.localStorage.getItem("oto_meishi_userId");
    if (!savedUserId) {
      setLoading(false);
      return;
    }

    setLoading(true);

    fetch(`/api/profile?userId=${encodeURIComponent(savedUserId)}`)
      .then(async (res) => {
        if (!res.ok) {
          const payload = await res.json();
          throw new Error(
            payload.error || "プロフィールの取得に失敗しました。",
          );
        }
        return res.json();
      })
      .then((data) => {
        setProfile(data as ProfileData);
        if (data.audioUrl) {
          setAudioUploadMessage("音源を変更できます");
        }
      })
      .catch((err) => {
        setError(
          err instanceof Error
            ? err.message
            : "プロフィールの取得に失敗しました。",
        );
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    return () => {
      if (audioPreviewUrl) URL.revokeObjectURL(audioPreviewUrl);
    };
  }, [audioPreviewUrl]);

  const updateField = (field: keyof ProfileData, value: string) => {
    setProfile((current) =>
      current ? { ...current, [field]: value } : current,
    );
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
      return { ...current, sns: next };
    });
  };

  const handleAudioFile = (file: File) => {
    setAudioFile(file);
    setProfile((current) =>
      current ? { ...current, audioUrl: file.name } : current,
    );
    setAudioPreviewUrl((previousUrl) => {
      if (previousUrl) URL.revokeObjectURL(previousUrl);
      return URL.createObjectURL(file);
    });
    setAudioUploadMessage(`変更を保存ボタンで${file.name}をアップできます<br/>（音源はサーバー側でAACファイルに変換されます）`);
  };

  const handleAudioInput = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) handleAudioFile(file);
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

  const addSocialLink = () => {
    setProfile((current) => {
      if (!current || current.sns.length >= 4) return current;
      return {
        ...current,
        sns: [
          ...current.sns,
          { service: "other", url: "", label: "リンクを追加" },
        ],
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

    const savedUserId = window.localStorage.getItem("oto_meishi_userId");
    if (!savedUserId) {
      setSaveState("error");
      setSaveMessage("ユーザーIDが設定されていません。");
      return;
    }

    setSaveState("saving");
    setSaveMessage("");

    try {
      // 音声ファイルが選択されている場合は先にアップロード
      let finalAudioUrl = profile.audioUrl;
      if (audioFile) {
        const formData = new FormData();
        formData.append("file", audioFile);
        formData.append("userId", savedUserId);

        const uploadResponse = await fetch("/api/audio/upload", {
          method: "POST",
          body: formData,
        });

        const uploadPayload = await uploadResponse.json().catch(() => ({}));

        if (!uploadResponse.ok) {
          throw new Error(
            uploadPayload.error || "音声のアップロードに失敗しました。",
          );
        }

        finalAudioUrl = uploadPayload.audioUrl;
        setAudioUploadMessage("音源をアップロードしました");
      }

      const response = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...profile,
          audioUrl: finalAudioUrl,
          userId: savedUserId,
        }),
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload.error || "保存に失敗しました。");
      }

      setProfile(payload as ProfileData);
      setAudioFile(null);
      setSaveState("success");
      setSaveMessage("プロフィールを保存しました。");
    } catch (err) {
      setSaveState("error");
      setSaveMessage(
        err instanceof Error ? err.message : "保存に失敗しました。",
      );
    }
  };

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
          <article className={`${styles.cardEditor} ${styles[profile.theme]}`}>
            <div className={styles.saveButtonRow}>
              <button
                type="button"
                className={styles.saveButton}
                onClick={handleSave}
                disabled={saveState === "saving"}
              >
                {saveState === "saving" ? "保存中..." : "変更を保存"}
              </button>
              {saveMessage ? (
                <p
                  className={`${styles.saveMessage} ${
                    saveState === "success"
                      ? styles.saveMessageSuccess
                      : styles.saveMessageError
                  }`}
                >
                  {saveMessage}
                </p>
              ) : null}
            </div>
            <div className={styles.cardTopBar}>
              <div>
                <p className={styles.cardBadge}>編集モード</p>
              </div>
              <div className={styles.actionsRow}>
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
              <label className={styles.label} htmlFor="displayName">
                表示名
              </label>
              <input
                id="displayName"
                className={styles.titleInput}
                type="text"
                value={profile.displayName}
                onChange={(event) =>
                  updateField("displayName", event.target.value)
                }
              />

              <label className={styles.label} htmlFor="bio">
                自己紹介
              </label>
              <textarea
                id="bio"
                className={styles.bioInput}
                value={profile.bio}
                onChange={(event) => updateField("bio", event.target.value)}
              />

              <div className={styles.audioGroup}>
                <div className={styles.audioField}>
                  <label className={styles.label} htmlFor="audioTitle">
                    音声タイトル
                  </label>
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
                      accept="audio/*"
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
                      <p
                        className={styles.uploadHint}
                        dangerouslySetInnerHTML={{
                          __html: audioUploadMessage || audioFile?.name || profile.audioUrl || "未選択",
                        }}
                      />
                    </label>
                  </div>
                  {(audioPreviewUrl || profile.audioUrl) && (
                    <div>
                      <audio
                        controls
                        className={styles.audioPlayer}
                        src={audioPreviewUrl || profile.audioUrl}
                      />
                    </div>
                  )}
                  <button
                    type="button"
                    className={styles.saveButton}
                    onClick={handleSave}
                    disabled={saveState === "saving"}
                  >
                    {saveState === "saving" ? "保存中..." : "変更を保存"}
                  </button>
                  {saveMessage ? (
                    <p
                      className={`${styles.saveMessage} ${
                        saveState === "success"
                          ? styles.saveMessageSuccess
                          : styles.saveMessageError
                      }`}
                    >
                      {saveMessage}
                    </p>
                  ) : null}
                </div>
              </div>

              <div className={styles.sectionHeader}>
                <h3 className={styles.sectionTitle}>サービスリンク</h3>
              </div>

              <div className={styles.socialList}>
                {profile.sns.map((link, index) => (
                  <div
                    key={`${link.service}-${index}`}
                    className={styles.socialRow}
                  >
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
                          updateSocialLink(index, "service", event.target.value)
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
                      <label
                        className={styles.smallLabel}
                        htmlFor={`label-${index}`}
                      >
                        ラベル
                      </label>
                      <input
                        id={`label-${index}`}
                        className={`${styles.input} ${styles.smallInput}`}
                        type="text"
                        value={link.label}
                        onChange={(event) =>
                          updateSocialLink(index, "label", event.target.value)
                        }
                      />
                    </div>

                    <div className={styles.serviceRow}>
                      <label
                        className={styles.smallLabel}
                        htmlFor={`url-${index}`}
                      >
                        URL
                      </label>
                      <input
                        id={`url-${index}`}
                        className={`${styles.input} ${styles.smallInput}`}
                        type="text"
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
                disabled={profile.sns.length >= 4}
              >
                + リンクを追加
              </button>
            </div>
            <div className={styles.saveButtonRow}>
              <button
                type="button"
                className={styles.saveButton}
                onClick={handleSave}
                disabled={saveState === "saving"}
              >
                {saveState === "saving" ? "保存中..." : "変更を保存"}
              </button>
              {saveMessage ? (
                <p
                  className={`${styles.saveMessage} ${
                    saveState === "success"
                      ? styles.saveMessageSuccess
                      : styles.saveMessageError
                  }`}
                >
                  {saveMessage}
                </p>
              ) : null}
            </div>
          </article>
        )}
      </section>
    </section>
  );
}
