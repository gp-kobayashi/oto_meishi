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
import {
  moderationReasonLabels,
  profileStatusLabels,
  targetTypeLabels,
} from "./moderationPresentation";

const actionLabels = {
  hide: "非公開",
  restore: "復旧",
  suspend: "利用停止",
  scheduleDeletion: "削除予定化",
  remove: "削除",
};


const formatDate = (value: string) =>
  new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));

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
            <AdminModeratedContentPanel
              profile={data.profile}
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
              onReload={loadDetail}
              onActionMessage={setActionMessage}
            />

            <AdminModerationRequestsPanel
              requests={data.profile.moderationRequests}
              onReload={loadDetail}
              onActionMessage={setActionMessage}
            />

            <AdminReportsPanel
              reports={data.profile.reports}
              onReload={loadDetail}
              onActionMessage={setActionMessage}
            />

            <section
              className={styles.panel}
              aria-labelledby="violation-history-heading"
            >
              <div className={styles.sectionHeading}>
                <h2 id="violation-history-heading">違反履歴</h2>
                <span>有効 {data.profile.violationSummary.activeCount}件</span>
              </div>
              {Object.keys(data.profile.violationSummary.countsByReason)
                .length ? (
                <dl className={styles.violationSummary}>
                  {Object.entries(
                    data.profile.violationSummary.countsByReason,
                  ).map(([reasonCode, count]) => (
                    <div key={reasonCode}>
                      <dt>
                        {moderationReasonLabels[
                          reasonCode as keyof typeof moderationReasonLabels
                        ] ?? reasonCode}
                      </dt>
                      <dd>{count}件</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className={styles.emptyHistory}>
                  現在の違反回数に含まれる事案はありません。
                </p>
              )}
              {data.profile.violationEvents.length ? (
                <ol className={styles.violationHistoryList}>
                  {data.profile.violationEvents.map((event) => (
                    <li
                      key={event.id}
                      className={event.isActive ? styles.activeViolation : ""}
                    >
                      <div className={styles.historyHeader}>
                        <div>
                          <span className={styles.historyTarget}>
                            {event.eventType === "revoked"
                              ? "取り消し"
                              : event.isActive
                                ? "有効"
                                : "取消済み"}
                          </span>
                          <strong>
                            {event.eventType === "revoked"
                              ? "違反回数の取り消し"
                              : moderationReasonLabels[event.reasonCode]}
                          </strong>
                        </div>
                        <time dateTime={event.createdAt}>
                          {formatDate(event.createdAt)}
                        </time>
                      </div>
                      <p className={styles.historyReason}>{event.note}</p>
                      {event.suspensionTriggered ? (
                        <p className={styles.suspensionTrigger}>
                          この違反確定により利用停止
                        </p>
                      ) : null}
                      <p className={styles.historyAdmin}>
                        担当者: {event.adminRole ?? "不明"} /{" "}
                        {event.adminIdentifier ?? "記録なし"}
                      </p>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className={styles.emptyHistory}>違反履歴はありません。</p>
              )}
            </section>

            <section className={styles.panel} aria-labelledby="history-heading">
              <div className={styles.sectionHeading}>
                <h2 id="history-heading">管理操作履歴</h2>
                <span>最新{data.profile.history.length}件</span>
              </div>
              {data.profile.history.length ? (
                <ol className={styles.historyList}>
                  {data.profile.history.map((entry) => (
                    <li key={entry.id}>
                      <div className={styles.historyHeader}>
                        <div>
                          <span className={styles.historyTarget}>
                            {targetTypeLabels[entry.targetType]}
                          </span>
                          <strong>{actionLabels[entry.action]}</strong>
                        </div>
                        <time dateTime={entry.createdAt}>{formatDate(entry.createdAt)}</time>
                      </div>
                      <p className={styles.statusChange}>
                        {entry.previousStatus} → {entry.newStatus}
                      </p>
                      <p className={styles.historyReason}>{entry.reason}</p>
                      <p className={styles.historyAdmin}>
                        {entry.actorType === "system"
                          ? "実行者: システム"
                          : `実行者: ${entry.adminRole ?? "不明"} / ${entry.adminIdentifier ?? "記録なし"}`}
                      </p>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className={styles.emptyHistory}>管理操作履歴はありません。</p>
              )}
              {data.profile.history.length === 50 ? (
                <p className={styles.historyNote}>最新50件を表示しています。</p>
              ) : null}
            </section>
          </article>
        ) : null}
      </div>
    </section>
  );
}
