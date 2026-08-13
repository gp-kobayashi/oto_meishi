"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { ModerationDetailResponse } from "@/lib/adminModeration";
import styles from "./page.module.css";

const reportReasonLabels = {
  inappropriate_audio: "不適切な音声",
  harassment: "誹謗中傷・嫌がらせ",
  unsafe_link: "危険または不正なリンク",
  impersonation: "なりすまし",
  other: "その他",
};
const reportStatusLabels = {
  pending: "未確認",
  reviewed: "確認済み",
  resolved: "対応済み",
  dismissed: "対応不要",
};
type PendingReportAction = {
  reportId: string;
  status: "reviewed" | "resolved" | "dismissed";
  statusLabel: string;
};
type Reports = ModerationDetailResponse["profile"]["reports"];
const formatDate = (value: string) =>
  new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));

export default function AdminReportsPanel({
  reports,
  onReload,
  onActionMessage,
}: {
  reports: Reports;
  onReload: () => Promise<void>;
  onActionMessage: (message: string) => void;
}) {
  const [updatingReportId, setUpdatingReportId] = useState("");
  const [reportError, setReportError] = useState("");
  const [pendingReportAction, setPendingReportAction] =
    useState<PendingReportAction | null>(null);
  const [reportNote, setReportNote] = useState("");
  const updateReportStatus = async (
    reportId: string,
    status: PendingReportAction["status"],
    note: string,
  ) => {
    if (updatingReportId) {
      return;
    }
    setUpdatingReportId(reportId);
    setReportError("");
    onActionMessage("");
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
        `/api/admin/reports/${encodeURIComponent(reportId)}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ status, note }),
        },
      );
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.error || "通報状態を変更できませんでした。");
      }
      await onReload();
      setPendingReportAction(null);
      setReportNote("");
      onActionMessage(
        `通報を「${reportStatusLabels[status]}」に変更しました。`,
      );
    } catch (error) {
      setReportError(
        error instanceof Error
          ? error.message
          : "通報状態を変更できませんでした。",
      );
    } finally {
      setUpdatingReportId("");
    }
  };
  return (
    <>
      <section className={styles.panel} aria-labelledby="reports-heading">
        <div className={styles.sectionHeading}>
          <h2 id="reports-heading">通報</h2>
          <span>最新{reports.length}件</span>
        </div>
        {reports.length ? (
          <ol className={styles.reportList}>
            {reports.map((report) => (
              <li key={report.id}>
                <div className={styles.reportHeader}>
                  <strong>{reportReasonLabels[report.reason]}</strong>
                  <span
                    className={`${styles.reportStatus} ${styles[report.status]}`}
                  >
                    {reportStatusLabels[report.status]}
                  </span>
                </div>
                <p className={styles.reportDetails}>
                  {report.details || "詳細は入力されていません。"}
                </p>
                <time dateTime={report.createdAt}>
                  受付日時: {formatDate(report.createdAt)}
                </time>
                {report.reviewedAt && report.reviewerIdentifier ? (
                  <p className={styles.reportReviewer}>
                    最終変更: {formatDate(report.reviewedAt)} /{" "}
                    {report.reviewerRole} / {report.reviewerIdentifier}
                  </p>
                ) : null}
                {report.reviewNote ? (
                  <p className={styles.reportReviewNote}>
                    対応メモ: {report.reviewNote}
                  </p>
                ) : null}
                {report.statusEvents.length ? (
                  <section
                    className={styles.reportStatusHistory}
                    aria-label="通報対応履歴"
                  >
                    <h3>対応履歴</h3>
                    <ol>
                      {report.statusEvents.map((event) => (
                        <li key={event.id}>
                          <div className={styles.reportHistoryHeader}>
                            <strong>
                              {event.previousStatus
                                ? reportStatusLabels[event.previousStatus]
                                : "移行時点"}
                              {" → "}
                              {reportStatusLabels[event.newStatus]}
                            </strong>
                            <time dateTime={event.createdAt}>
                              {formatDate(event.createdAt)}
                            </time>
                          </div>
                          <p>{event.note || "対応メモなし"}</p>
                          <span>
                            担当者: {event.adminRole ?? "不明"} /{" "}
                            {event.adminIdentifier ?? "記録なし"}
                            {event.isBackfilled ? "（既存記録）" : ""}
                          </span>
                        </li>
                      ))}
                    </ol>
                  </section>
                ) : null}
                {report.status === "pending" || report.status === "reviewed" ? (
                  <div className={styles.reportActions}>
                    {report.status === "pending" ? (
                      <button
                        type="button"
                        disabled={Boolean(updatingReportId)}
                        onClick={() =>
                          setPendingReportAction({
                            reportId: report.id,
                            status: "reviewed",
                            statusLabel: "確認済み",
                          })
                        }
                      >
                        確認済みにする
                      </button>
                    ) : null}
                    <button
                      type="button"
                      disabled={Boolean(updatingReportId)}
                      onClick={() =>
                        setPendingReportAction({
                          reportId: report.id,
                          status: "resolved",
                          statusLabel: "対応済み",
                        })
                      }
                    >
                      対応済みにする
                    </button>
                    <button
                      type="button"
                      disabled={Boolean(updatingReportId)}
                      onClick={() =>
                        setPendingReportAction({
                          reportId: report.id,
                          status: "dismissed",
                          statusLabel: "対応不要",
                        })
                      }
                    >
                      対応不要にする
                    </button>
                  </div>
                ) : null}
              </li>
            ))}
          </ol>
        ) : (
          <p className={styles.emptyHistory}>通報はありません。</p>
        )}
        {reports.length === 50 ? (
          <p className={styles.historyNote}>最新50件を表示しています。</p>
        ) : null}
        {reportError ? (
          <p className={styles.actionError} role="alert">
            {reportError}
          </p>
        ) : null}
      </section>
      {pendingReportAction ? (
        <div className={styles.modalBackdrop}>
          <section
            className={styles.actionDialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="report-action-dialog-title"
          >
            <p className={styles.dialogEyebrow}>通報状態の変更</p>
            <h2 id="report-action-dialog-title">
              通報を「{pendingReportAction.statusLabel}」にします
            </h2>
            <p>判断理由を対応メモとして記録します。</p>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (reportNote.trim()) {
                  void updateReportStatus(
                    pendingReportAction.reportId,
                    pendingReportAction.status,
                    reportNote.trim(),
                  );
                }
              }}
            >
              <label htmlFor="report-review-note">対応メモ（必須）</label>
              <textarea
                id="report-review-note"
                value={reportNote}
                maxLength={500}
                rows={5}
                autoFocus
                onChange={(event) => setReportNote(event.target.value)}
              />
              <p className={styles.characterCount}>{reportNote.length} / 500</p>
              {reportError ? (
                <p className={styles.actionError} role="alert">
                  {reportError}
                </p>
              ) : null}
              <div className={styles.dialogActions}>
                <button
                  type="button"
                  disabled={Boolean(updatingReportId)}
                  onClick={() => {
                    setPendingReportAction(null);
                    setReportNote("");
                    setReportError("");
                  }}
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  className={styles.confirmButton}
                  disabled={!reportNote.trim() || Boolean(updatingReportId)}
                >
                  {updatingReportId ? "変更中..." : "メモを記録して変更"}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </>
  );
}
