"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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

function formatAttentionCount(count: number) {
  if (count <= 0) return null;
  return count >= 10 ? "9+" : String(count);
}

export default function AdminPage() {
  const router = useRouter();
  const [data, setData] = useState<ModerationListResponse | null>(null);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<ModerationFilter>("all");
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const requestIdRef = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  const loadItems = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
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
        signal: controller.signal,
      });
      if (response.status === 403) {
        if (requestId === requestIdRef.current) router.replace("/profile");
        return;
      }
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          result.error || "管理対象の一覧を取得できませんでした。",
        );
      }

      if (requestId === requestIdRef.current) {
        setData(result as ModerationListResponse);
      }
    } catch (loadError) {
      if (
        requestId === requestIdRef.current &&
        !(loadError instanceof Error && loadError.name === "AbortError")
      ) {
        setData(null);
        setError(
          loadError instanceof Error
            ? loadError.message
            : "管理対象の一覧を取得できませんでした。",
        );
      }
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [filter, page, query, router]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => void loadItems(), 0);
    return () => window.clearTimeout(timeoutId);
  }, [loadItems]);

  useEffect(
    () => () => {
      requestIdRef.current += 1;
      abortControllerRef.current?.abort();
    },
    [],
  );

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPage(1);
    setQuery(searchInput.trim());
  };

  const toggleItem = (itemId: string) => {
    setExpandedItems((current) => {
      const next = new Set(current);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
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
        </header>

        <div className={styles.controls}>
          <div className={styles.filters} aria-label="公開状態で絞り込む">
            {filterOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                className={filter === option.value ? styles.activeFilter : ""}
                aria-label={
                  option.value === "attention" && data?.attentionTotal
                    ? `要対応 ${formatAttentionCount(data.attentionTotal)}件`
                    : undefined
                }
                onClick={() => {
                  setFilter(option.value);
                  setPage(1);
                }}
              >
                <span>{option.label}</span>
                {option.value === "attention" && data?.attentionTotal ? (
                  <span className={styles.attentionCount} aria-hidden="true">
                    {formatAttentionCount(data.attentionTotal)}
                  </span>
                ) : null}
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
            {data.items.map((item) => {
              const isExpanded = expandedItems.has(item.id);
              const detailsId = `moderation-details-${item.id}`;

              return (
                <article className={styles.item} key={item.id}>
                  <div className={styles.primaryRow}>
                    <div className={styles.userInfo}>
                      <div>
                        <p className={styles.userId}>@{item.userId}</p>
                        <h2>{item.displayName}</h2>
                      </div>
                    </div>
                    <div className={styles.itemActions}>
                      <span
                        className={
                          item.pendingReviewCount > 0
                            ? styles.reviewAttention
                            : styles.reviewSummary
                        }
                      >
                        審査待ち {item.pendingReviewCount}件
                      </span>
                      <span
                        className={`${styles.badge} ${styles[item.status]}`}
                      >
                        {profileStatusLabels[item.status]}
                      </span>
                      <Link
                        href={`/admin/moderation/${encodeURIComponent(item.id)}`}
                      >
                        詳細を確認
                      </Link>
                      <button
                        type="button"
                        className={styles.expandButton}
                        aria-expanded={isExpanded}
                        aria-controls={detailsId}
                        aria-label={`${item.displayName}の詳細を${isExpanded ? "閉じる" : "開く"}`}
                        onClick={() => toggleItem(item.id)}
                      >
                        {isExpanded ? "▲" : "▼"}
                      </button>
                    </div>
                  </div>

                  {isExpanded ? (
                    <div className={styles.details} id={detailsId}>
                      <div className={styles.audioSection}>
                        <p className={styles.label}>音声</p>
                        <div className={styles.audioHeader}>
                          <span>{item.audioTitle || "未登録"}</span>
                          <span
                            className={`${styles.smallBadge} ${styles[item.audioStatus]}`}
                          >
                            {audioStatusLabels[item.audioStatus]}
                          </span>
                        </div>
                        {item.hasAudio ? (
                          <AdminAudioPlayer profileId={item.id} />
                        ) : null}
                      </div>
                      <div className={styles.contentGrid}>
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
                          <p className={styles.label}>最終更新</p>
                          <time dateTime={item.updatedAt}>
                            {new Intl.DateTimeFormat("ja-JP", {
                              dateStyle: "medium",
                              timeStyle: "short",
                            }).format(new Date(item.updatedAt))}
                          </time>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </article>
              );
            })}
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
