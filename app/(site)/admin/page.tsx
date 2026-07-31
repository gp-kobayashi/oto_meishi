"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import {
  type ModerationFilter,
  type ModerationListResponse,
} from "@/lib/adminModeration";
import styles from "./page.module.css";
import AdminAudioPlayer from "@/components/admin/AdminAudioPlayer";

const filterOptions: { value: ModerationFilter; label: string }[] = [
  { value: "all", label: "すべて" },
  { value: "attention", label: "要対応" },
  { value: "active", label: "公開中" },
  { value: "hidden", label: "非公開" },
  { value: "suspended", label: "利用停止" },
];

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

export default function AdminPage() {
  const [data, setData] = useState<ModerationListResponse | null>(null);
  const [filter, setFilter] = useState<ModerationFilter>("all");
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadItems = useCallback(async () => {
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

      const params = new URLSearchParams({
        filter,
        page: String(page),
      });
      if (query) params.set("q", query);

      const response = await fetch(`/api/admin/moderation?${params}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.error || "管理対象の一覧を取得できませんでした。");
      }

      setData(result as ModerationListResponse);
    } catch (loadError) {
      setData(null);
      setError(
        loadError instanceof Error
          ? loadError.message
          : "管理対象の一覧を取得できませんでした。",
      );
    } finally {
      setLoading(false);
    }
  }, [filter, page, query]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => void loadItems(), 0);
    return () => window.clearTimeout(timeoutId);
  }, [loadItems]);

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPage(1);
    setQuery(searchInput.trim());
  };

  return (
    <section className={styles.page}>
      <div className={styles.container}>
        <header className={styles.heading}>
          <div>
            <p className={styles.eyebrow}>MODERATION</p>
            <h1>管理対象一覧</h1>
            <p>プロフィール、音声、リンクの公開状態を確認します。</p>
          </div>
          {data ? <p className={styles.total}>{data.pagination.total}件</p> : null}
        </header>

        <div className={styles.controls}>
          <div className={styles.filters} aria-label="公開状態で絞り込む">
            {filterOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                className={filter === option.value ? styles.activeFilter : ""}
                onClick={() => {
                  setFilter(option.value);
                  setPage(1);
                }}
              >
                {option.label}
              </button>
            ))}
          </div>

          <form className={styles.search} onSubmit={submitSearch}>
            <label htmlFor="moderation-search">ユーザーを検索</label>
            <div>
              <input
                id="moderation-search"
                type="search"
                value={searchInput}
                placeholder="ユーザーIDまたは表示名"
                onChange={(event) => setSearchInput(event.target.value)}
              />
              <button type="submit">検索</button>
            </div>
          </form>
        </div>

        {loading ? (
          <p className={styles.message}>読み込み中...</p>
        ) : error ? (
          <div className={styles.error} role="alert">
            <p>{error}</p>
            <button type="button" onClick={() => void loadItems()}>
              再読み込み
            </button>
          </div>
        ) : data?.items.length ? (
          <div className={styles.list}>
            {data.items.map((item) => (
              <article className={styles.item} key={item.id}>
                <div className={styles.userInfo}>
                  <div>
                    <p className={styles.userId}>@{item.userId}</p>
                    <h2>{item.displayName}</h2>
                  </div>
                  <span className={`${styles.badge} ${styles[item.status]}`}>
                    {profileStatusLabels[item.status]}
                  </span>
                </div>

                <div className={styles.contentGrid}>
                  <div>
                    <p className={styles.label}>音声</p>
                    <div className={styles.audioHeader}>
                      <span>{item.audioTitle || "未登録"}</span>
                      <span className={`${styles.smallBadge} ${styles[item.audioStatus]}`}>
                        {audioStatusLabels[item.audioStatus]}
                      </span>
                    </div>
                    {item.hasAudio ? <AdminAudioPlayer profileId={item.id} /> : null}
                  </div>
                  <div>
                    <p className={styles.label}>リンク</p>
                    <p className={styles.linkSummary}>
                      {item.linkCount}件
                      {item.hiddenLinkCount > 0
                        ? `（非公開 ${item.hiddenLinkCount}件）`
                        : ""}
                    </p>
                  </div>
                  <div>
                    <p className={styles.label}>未確認の通報</p>
                    <p
                      className={
                        item.pendingReportCount > 0
                          ? styles.reportAttention
                          : styles.reportSummary
                      }
                    >
                      {item.pendingReportCount}件
                    </p>
                  </div>
                  <div>
                    <p className={styles.label}>審査待ち</p>
                    <p
                      className={
                        item.pendingReviewCount > 0
                          ? styles.reportAttention
                          : styles.reportSummary
                      }
                    >
                      {item.pendingReviewCount}件
                    </p>
                  </div>
                  <div>
                    <p className={styles.label}>最終更新</p>
                    <time dateTime={item.updatedAt}>
                      {new Intl.DateTimeFormat("ja-JP", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      }).format(new Date(item.updatedAt))}
                    </time>
                  </div>
                </div>
                <div className={styles.itemFooter}>
                  <Link href={`/admin/moderation/${encodeURIComponent(item.id)}`}>
                    詳細を確認
                  </Link>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className={styles.message}>該当するプロフィールはありません。</p>
        )}

        {data && data.pagination.totalPages > 1 ? (
          <nav className={styles.pagination} aria-label="ページ切り替え">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((current) => current - 1)}
            >
              前へ
            </button>
            <span>
              {page} / {data.pagination.totalPages}
            </span>
            <button
              type="button"
              disabled={page >= data.pagination.totalPages}
              onClick={() => setPage((current) => current + 1)}
            >
              次へ
            </button>
          </nav>
        ) : null}
      </div>
    </section>
  );
}
