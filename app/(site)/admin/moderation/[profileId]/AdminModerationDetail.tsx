"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
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

export default function AdminModerationDetail({ profileId }: { profileId: string }) {
  const [data, setData] = useState<ModerationDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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
                    </article>
                  ))}
                </div>
              ) : (
                <p>リンクは登録されていません。</p>
              )}
            </section>
          </article>
        ) : null}
      </div>
    </section>
  );
}
