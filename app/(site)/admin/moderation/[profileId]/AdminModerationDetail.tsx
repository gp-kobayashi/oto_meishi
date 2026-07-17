"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { ModerationDetailResponse } from "@/lib/adminModeration";
import styles from "./page.module.css";

const profileStatusLabels = {
  active: "公開中",
  hidden: "非公開",
  suspended: "利用停止",
};

const audioStatusLabels = {
  active: "公開中",
  hidden: "非公開",
  removed: "削除済み",
};

const linkStatusLabels = {
  active: "公開中",
  hidden: "非公開",
};

const formatDate = (value: string) =>
  new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));

const isSafeHttpsUrl = (value: string) => {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
};

type PendingAction = {
  targetType: "profile" | "audio" | "socialLink";
  targetId: string;
  action: "hide" | "restore" | "suspend";
  targetLabel: string;
  actionLabel: string;
};

export default function AdminModerationDetail({ profileId }: { profileId: string }) {
  const [data, setData] = useState<ModerationDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [reason, setReason] = useState("");
  const [actionError, setActionError] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const loadDetail = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      if (!supabase) {
        throw new Error("認証クライアントが初期化されていません。");
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        throw new Error("管理者アカウントでログインしてください。");
      }

      const response = await fetch(
        `/api/admin/moderation/${encodeURIComponent(profileId)}`,
        { headers: { Authorization: `Bearer ${session.access_token}` } },
      );
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.error || "管理対象の詳細を取得できませんでした。");
      }

      setData(result as ModerationDetailResponse);
    } catch (loadError) {
      setData(null);
      setError(
        loadError instanceof Error
          ? loadError.message
          : "管理対象の詳細を取得できませんでした。",
      );
    } finally {
      setLoading(false);
    }
  }, [profileId]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => void loadDetail(), 0);
    return () => window.clearTimeout(timeoutId);
  }, [loadDetail]);

  const openAction = (action: PendingAction) => {
    setPendingAction(action);
    setReason("");
    setActionError("");
    setActionMessage("");
  };

  const submitAction = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!pendingAction || !reason.trim() || submitting) return;

    setSubmitting(true);
    setActionError("");
    try {
      if (!supabase) throw new Error("認証クライアントが初期化されていません。");
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error("管理者アカウントでログインしてください。");

      const response = await fetch("/api/admin/moderation/actions", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          targetType: pendingAction.targetType,
          targetId: pendingAction.targetId,
          action: pendingAction.action,
          reason: reason.trim(),
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.error || "公開状態を変更できませんでした。");
      }

      const completedLabel = `${pendingAction.targetLabel}を${pendingAction.actionLabel}にしました。`;
      setPendingAction(null);
      setReason("");
      await loadDetail();
      setActionMessage(completedLabel);
    } catch (submitError) {
      setActionError(
        submitError instanceof Error
          ? submitError.message
          : "公開状態を変更できませんでした。",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className={styles.page}>
      <div className={styles.container}>
        <Link className={styles.backLink} href="/admin">
          ← 管理対象一覧へ戻る
        </Link>

        {loading ? (
          <p className={styles.message}>読み込み中...</p>
        ) : error ? (
          <div className={styles.error} role="alert">
            <p>{error}</p>
            <button type="button" onClick={() => void loadDetail()}>
              再読み込み
            </button>
          </div>
        ) : data ? (
          <article>
            {actionMessage ? (
              <p className={styles.successMessage} role="status">
                {actionMessage}
              </p>
            ) : null}
            <header className={styles.heading}>
              <div>
                <p className={styles.eyebrow}>MODERATION DETAIL</p>
                <p className={styles.userId}>@{data.profile.userId}</p>
                <h1>{data.profile.displayName}</h1>
              </div>
              <span className={`${styles.badge} ${styles[data.profile.status]}`}>
                {profileStatusLabels[data.profile.status]}
              </span>
            </header>

            <section className={styles.panel} aria-labelledby="profile-heading">
              <h2 id="profile-heading">プロフィール</h2>
              <dl className={styles.definitionList}>
                <div>
                  <dt>自己紹介</dt>
                  <dd className={styles.bio}>{data.profile.bio || "未登録"}</dd>
                </div>
                <div>
                  <dt>テーマ</dt>
                  <dd>{data.profile.theme}</dd>
                </div>
                <div>
                  <dt>登録日時</dt>
                  <dd>{formatDate(data.profile.createdAt)}</dd>
                </div>
                <div>
                  <dt>更新日時</dt>
                  <dd>{formatDate(data.profile.updatedAt)}</dd>
                </div>
              </dl>
              <Link
                className={styles.publicLink}
                href={`/${encodeURIComponent(data.profile.userId)}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                公開ページを別タブで確認
              </Link>
              <div className={styles.actions}>
                {data.profile.status === "active" ? (
                  <>
                    <button
                      type="button"
                      onClick={() =>
                        openAction({
                          targetType: "profile",
                          targetId: data.profile.id,
                          action: "hide",
                          targetLabel: "プロフィール",
                          actionLabel: "非公開",
                        })
                      }
                    >
                      プロフィールを非公開
                    </button>
                    <button
                      type="button"
                      className={styles.dangerButton}
                      onClick={() =>
                        openAction({
                          targetType: "profile",
                          targetId: data.profile.id,
                          action: "suspend",
                          targetLabel: "プロフィール",
                          actionLabel: "利用停止",
                        })
                      }
                    >
                      アカウントを利用停止
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() =>
                      openAction({
                        targetType: "profile",
                        targetId: data.profile.id,
                        action: "restore",
                        targetLabel: "プロフィール",
                        actionLabel: "公開中",
                      })
                    }
                  >
                    プロフィールを復旧
                  </button>
                )}
              </div>
            </section>

            <section className={styles.panel} aria-labelledby="audio-heading">
              <div className={styles.sectionHeading}>
                <h2 id="audio-heading">音声</h2>
                <span className={`${styles.smallBadge} ${styles[data.profile.audioStatus]}`}>
                  {audioStatusLabels[data.profile.audioStatus]}
                </span>
              </div>
              <p className={styles.audioTitle}>
                {data.profile.audioTitle || "音声は登録されていません。"}
              </p>
              {data.profile.audioUrl ? (
                <audio controls preload="none" src={data.profile.audioUrl} />
              ) : null}
              {data.profile.audioUrl && data.profile.audioStatus !== "removed" ? (
                <div className={styles.actions}>
                  <button
                    type="button"
                    onClick={() =>
                      openAction({
                        targetType: "audio",
                        targetId: data.profile.id,
                        action:
                          data.profile.audioStatus === "active" ? "hide" : "restore",
                        targetLabel: "音声",
                        actionLabel:
                          data.profile.audioStatus === "active" ? "非公開" : "公開中",
                      })
                    }
                  >
                    音声を
                    {data.profile.audioStatus === "active" ? "非公開" : "復旧"}
                  </button>
                </div>
              ) : null}
            </section>

            <section className={styles.panel} aria-labelledby="links-heading">
              <div className={styles.sectionHeading}>
                <h2 id="links-heading">リンク</h2>
                <span>{data.profile.links.length}件</span>
              </div>
              {data.profile.links.length ? (
                <div className={styles.links}>
                  {data.profile.links.map((socialLink) => (
                    <article className={styles.linkItem} key={socialLink.id}>
                      <div className={styles.linkHeading}>
                        <div>
                          <p className={styles.service}>{socialLink.service}</p>
                          <h3>{socialLink.label}</h3>
                        </div>
                        <span className={`${styles.smallBadge} ${styles[socialLink.status]}`}>
                          {linkStatusLabels[socialLink.status]}
                        </span>
                      </div>
                      <p className={styles.url}>{socialLink.url}</p>
                      {isSafeHttpsUrl(socialLink.url) ? (
                        <a
                          href={socialLink.url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          リンク先を別タブで開く
                        </a>
                      ) : (
                        <p className={styles.unsafeUrl}>
                          HTTPSではないためリンクを無効化しています。
                        </p>
                      )}
                      <div className={styles.actions}>
                        <button
                          type="button"
                          onClick={() =>
                            openAction({
                              targetType: "socialLink",
                              targetId: socialLink.id,
                              action: socialLink.status === "active" ? "hide" : "restore",
                              targetLabel: `リンク「${socialLink.label}」`,
                              actionLabel:
                                socialLink.status === "active" ? "非公開" : "公開中",
                            })
                          }
                        >
                          リンクを
                          {socialLink.status === "active" ? "非公開" : "復旧"}
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <p>リンクは登録されていません。</p>
              )}
            </section>

            {pendingAction ? (
              <div className={styles.modalBackdrop}>
                <section
                  className={styles.actionDialog}
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="action-dialog-title"
                >
                  <p className={styles.dialogEyebrow}>状態変更の確認</p>
                  <h2 id="action-dialog-title">
                    {pendingAction.targetLabel}を{pendingAction.actionLabel}にします
                  </h2>
                  <p>実行すると管理操作履歴に管理者・理由・変更内容が保存されます。</p>
                  <form onSubmit={submitAction}>
                    <label htmlFor="moderation-reason">対応理由（必須）</label>
                    <textarea
                      id="moderation-reason"
                      value={reason}
                      maxLength={500}
                      rows={5}
                      autoFocus
                      onChange={(event) => setReason(event.target.value)}
                    />
                    <p className={styles.characterCount}>{reason.length} / 500</p>
                    {actionError ? (
                      <p className={styles.actionError} role="alert">
                        {actionError}
                      </p>
                    ) : null}
                    <div className={styles.dialogActions}>
                      <button
                        type="button"
                        disabled={submitting}
                        onClick={() => setPendingAction(null)}
                      >
                        キャンセル
                      </button>
                      <button
                        type="submit"
                        className={styles.confirmButton}
                        disabled={!reason.trim() || submitting}
                      >
                        {submitting ? "変更中..." : "理由を記録して実行"}
                      </button>
                    </div>
                  </form>
                </section>
              </div>
            ) : null}
          </article>
        ) : null}
      </div>
    </section>
  );
}
