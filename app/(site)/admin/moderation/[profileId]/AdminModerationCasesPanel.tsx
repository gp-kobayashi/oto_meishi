"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { ModerationDetailResponse } from "@/lib/adminModeration";
import AdminAudioPlayer from "@/components/admin/AdminAudioPlayer";
import styles from "./page.module.css";

export const moderationCaseStatusLabels = {
  correctionRequired: "修正待ち",
  postReviewPending: "管理者確認待ち（非公開）",
  preReviewPending: "管理者確認待ち（非公開）",
  confirmed: "確認済み",
};
const moderationCaseEventLabels = {
  created: "非公開対応を開始",
  contentChanged: "ユーザーが内容を変更",
  contentDeleted: "ユーザーが対象を削除",
  statusChanged: "状態を変更",
  reviewApproved: "管理者が修正を承認",
  reviewRejected: "管理者が追加対応を依頼",
  accountSuspended: "アカウントを利用停止",
  appealSubmitted: "解除申請を送信",
  accountRestored: "アカウントを復旧",
  deletionScheduled: "削除予定に変更",
  autoConfirmed: "期限経過により自動確認",
};
export const moderationReasonLabels = {
  inappropriateContent: "不適切な内容",
  copyrightConcern: "著作権に関する問題",
  harassment: "誹謗中傷",
  unsafeLink: "安全でないリンク",
  serviceMismatch: "選択サービスとURLの不一致",
  impersonation: "なりすまし",
  threatOrPersonalData: "脅迫・第三者の個人情報",
  unofficialThirdPartyProfile: "他人を主体としたプロフィール",
  politicalReligiousPromotion: "政治・宗教への勧誘・宣伝",
  other: "その他",
};
export const targetTypeLabels = {
  profile: "プロフィール",
  audio: "音声",
  socialLink: "リンク",
};
const profileFieldLabels = {
  displayName: "表示名",
  bio: "自己紹介",
  theme: "テーマ",
} as const;
const formatDate = (value: string) =>
  new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
const formatSnapshotContent = (content: unknown) => {
  if (
    typeof content !== "object" ||
    content === null ||
    Array.isArray(content)
  ) {
    return String(content ?? "記録なし");
  }
  const entries = Object.entries(content);
  if (!entries.length) {
    return "記録なし";
  }
  return entries
    .map(([key, value]) => `${key}: ${String(value ?? "")}`)
    .join("\n");
};
const getChangedProfileFields = (details: unknown) => {
  if (
    typeof details !== "object" ||
    details === null ||
    Array.isArray(details)
  ) {
    return [];
  }
  const changedFields = (details as Record<string, unknown>).changedFields;
  if (!Array.isArray(changedFields)) {
    return [];
  }
  return changedFields.filter(
    (field): field is keyof typeof profileFieldLabels =>
      typeof field === "string" && field in profileFieldLabels,
  );
};

interface AdminModerationCasesPanelProps {
  cases: ModerationDetailResponse["profile"]["moderationCases"];
  profileId: string;
  hasAudio: boolean;
  onReload: () => Promise<void>;
  onActionMessage: (message: string) => void;
}

export default function AdminModerationCasesPanel({
  cases,
  profileId,
  hasAudio,
  onReload,
  onActionMessage,
}: AdminModerationCasesPanelProps) {
  const [caseResponses, setCaseResponses] = useState<Record<string, string>>(
    {},
  );
  const [updatingCaseId, setUpdatingCaseId] = useState("");
  const [caseError, setCaseError] = useState("");
  const reviewModerationCase = async (
    caseId: string,
    decision: "approve" | "continueHidden" | "requestChanges",
    reviewedSnapshotId: string | null,
  ) => {
    const reviewReason = caseResponses[caseId]?.trim() ?? "";
    if (!reviewReason || updatingCaseId) {
      return;
    }
    setUpdatingCaseId(caseId);
    setCaseError("");
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
        `/api/admin/moderation/cases/${encodeURIComponent(caseId)}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            decision,
            reason: reviewReason,
            reviewedSnapshotId,
          }),
        },
      );
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.error || "審査結果を保存できませんでした。");
      }
      setCaseResponses((current) => ({ ...current, [caseId]: "" }));
      await onReload();
      onActionMessage("審査結果を保存し、ユーザーへ通知しました。");
    } catch (reviewError) {
      setCaseError(
        reviewError instanceof Error
          ? reviewError.message
          : "審査結果を保存できませんでした。",
      );
    } finally {
      setUpdatingCaseId("");
    }
  };

  return (
    <section className={styles.panel} aria-labelledby="cases-heading">
      <div className={styles.sectionHeading}>
        <h2 id="cases-heading">修正内容と審査状況</h2>
        <span>最新{cases.length}件</span>
      </div>
      {caseError ? (
        <p className={styles.actionError} role="alert">
          {caseError}
        </p>
      ) : null}
      {cases.length ? (
        <ol className={styles.caseList}>
          {cases.map((moderationCase) => {
            const latestReported = moderationCase.snapshots
              .filter((snapshot) => snapshot.kind === "reported")
              .at(-1);
            const latestCorrected = moderationCase.snapshots
              .filter((snapshot) => snapshot.kind === "corrected")
              .at(-1);
            const isPending =
              moderationCase.status === "postReviewPending" ||
              moderationCase.status === "preReviewPending";
            const latestContentChange = moderationCase.events.findLast(
              (event) => event.eventType === "contentChanged",
            );
            const changedProfileFields =
              moderationCase.targetType === "profile"
                ? getChangedProfileFields(latestContentChange?.details)
                : [];
            return (
              <li className={styles.caseItem} key={moderationCase.id}>
                <div className={styles.caseHeading}>
                  <div>
                    <span className={styles.historyTarget}>
                      {targetTypeLabels[moderationCase.targetType]}
                    </span>
                    <strong>
                      {moderationReasonLabels[moderationCase.reasonCode]}
                    </strong>
                  </div>
                  <span className={styles.reviewStatus}>
                    {moderationCaseStatusLabels[moderationCase.status]}
                  </span>
                </div>
                <p className={styles.caseMessage}>
                  対応理由: {moderationCase.userMessage}
                </p>
                {latestContentChange && changedProfileFields.length ? (
                  <div className={styles.changeSummary}>
                    <strong>変更された項目</strong>
                    <ul>
                      {changedProfileFields.map((field) => (
                        <li key={field}>{profileFieldLabels[field]}</li>
                      ))}
                    </ul>
                    <time dateTime={latestContentChange.createdAt}>
                      変更日時: {formatDate(latestContentChange.createdAt)}
                    </time>
                  </div>
                ) : null}
                <div className={styles.snapshotComparison}>
                  <div>
                    <h3>非公開時</h3>
                    <pre>
                      {latestReported
                        ? formatSnapshotContent(latestReported.content)
                        : "記録なし"}
                    </pre>
                    {latestReported ? (
                      <>
                        <time dateTime={latestReported.createdAt}>
                          {formatDate(latestReported.createdAt)}
                        </time>
                        {moderationCase.targetType === "audio" &&
                        latestReported.hasStoredAudio ? (
                          <AdminAudioPlayer
                            profileId={profileId}
                            snapshotId={latestReported.id}
                            label="非公開時の音声を確認"
                          />
                        ) : null}
                      </>
                    ) : null}
                  </div>
                  <div>
                    <h3>修正後</h3>
                    <pre>
                      {latestCorrected
                        ? formatSnapshotContent(latestCorrected.content)
                        : "まだ修正されていません"}
                    </pre>
                    {latestCorrected ? (
                      <>
                        <time dateTime={latestCorrected.createdAt}>
                          {formatDate(latestCorrected.createdAt)}
                        </time>
                        {moderationCase.targetType === "audio" &&
                        (latestCorrected.hasStoredAudio || hasAudio) ? (
                          <AdminAudioPlayer
                            profileId={profileId}
                            snapshotId={
                              latestCorrected.hasStoredAudio
                                ? latestCorrected.id
                                : undefined
                            }
                            label="修正後の音声を確認"
                          />
                        ) : null}
                      </>
                    ) : null}
                  </div>
                </div>
                <h3 className={styles.timelineHeading}>操作履歴</h3>
                {moderationCase.events.length ? (
                  <ol className={styles.caseTimeline}>
                    {moderationCase.events.map((caseEvent) => (
                      <li key={caseEvent.id}>
                        <strong>
                          {moderationCaseEventLabels[caseEvent.eventType]}
                        </strong>
                        <time dateTime={caseEvent.createdAt}>
                          {formatDate(caseEvent.createdAt)}
                        </time>
                        <span>
                          {caseEvent.actorType}
                          {caseEvent.actorIdentifier
                            ? ` / ${caseEvent.actorIdentifier}`
                            : ""}
                        </span>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className={styles.emptyHistory}>操作履歴はありません。</p>
                )}
                {isPending ? (
                  <div className={styles.caseReview}>
                    <label htmlFor={`case-response-${moderationCase.id}`}>
                      ユーザーに通知する審査理由（必須）
                    </label>
                    <textarea
                      id={`case-response-${moderationCase.id}`}
                      maxLength={500}
                      rows={4}
                      value={caseResponses[moderationCase.id] ?? ""}
                      onChange={(event) =>
                        setCaseResponses((current) => ({
                          ...current,
                          [moderationCase.id]: event.target.value,
                        }))
                      }
                    />
                    <div className={styles.reportActions}>
                      {(
                        [
                          ["approve", "修正を承認", !!latestCorrected],
                          ["continueHidden", "非公開を継続", false],
                          ["requestChanges", "追加修正を依頼", false],
                        ] as const
                      ).map(([decision, label, requiresCorrected]) => (
                        <button
                          key={decision}
                          type="button"
                          disabled={
                            updatingCaseId === moderationCase.id ||
                            (requiresCorrected && !latestCorrected) ||
                            !caseResponses[moderationCase.id]?.trim()
                          }
                          onClick={() =>
                            void reviewModerationCase(
                              moderationCase.id,
                              decision,
                              latestCorrected?.id ?? null,
                            )
                          }
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ol>
      ) : (
        <p className={styles.emptyHistory}>
          モデレーションケースはありません。
        </p>
      )}
    </section>
  );
}
