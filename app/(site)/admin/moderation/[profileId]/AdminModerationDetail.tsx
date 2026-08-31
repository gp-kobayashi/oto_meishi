"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { ModerationDetailResponse } from "@/lib/adminModeration";
import styles from "./page.module.css";
import AdminReportsPanel from "./AdminReportsPanel";
import AdminModerationRequestsPanel from "./AdminModerationRequestsPanel";
import AdminIdentityVerificationPanel from "./AdminIdentityVerificationPanel";
import AdminModerationCasesPanel from "./AdminModerationCasesPanel";
import AdminModeratedContentPanel from "./AdminModeratedContentPanel";
import AdminModerationHistoryPanels from "./AdminModerationHistoryPanels";
import AdminModerationAttentionSummary from "./AdminModerationAttentionSummary";
import {
  profileStatusLabels,
} from "./moderationPresentation";


export default function AdminModerationDetail({ profileId }: { profileId: string }) {
  const router = useRouter();
  const [data, setData] = useState<ModerationDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionMessage, setActionMessage] = useState("");

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
      if (response.status === 403) {
        router.replace("/profile");
        return;
      }
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
  }, [profileId, router]);

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
            <AdminModerationAttentionSummary profile={data.profile} />
            <AdminReportsPanel
              reports={data.profile.reports}
              onReload={loadDetail}
              onActionMessage={setActionMessage}
            />
            <AdminModerationCasesPanel
              cases={data.profile.moderationCases}
              profileId={data.profile.id}
              hasAudio={data.profile.hasAudio}
              onReload={loadDetail}
              onActionMessage={setActionMessage}
            />
            <AdminIdentityVerificationPanel
              requests={data.profile.identityVerificationRequests ?? []}
              profileLinks={data.profile.links}
              onReload={loadDetail}
              onActionMessage={setActionMessage}
            />

            <AdminModerationRequestsPanel
              requests={data.profile.moderationRequests}
              onReload={loadDetail}
              onActionMessage={setActionMessage}
            />

            <AdminModerationHistoryPanels
              violationSummary={data.profile.violationSummary}
              violationEvents={data.profile.violationEvents}
              history={data.profile.history}
            />
            <AdminModeratedContentPanel
              profile={data.profile}
              onReload={loadDetail}
              onActionMessage={setActionMessage}
            />
          </article>
        ) : null}
      </div>
    </section>
  );
}
