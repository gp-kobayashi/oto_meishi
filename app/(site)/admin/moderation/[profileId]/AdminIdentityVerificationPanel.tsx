"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { ModerationDetailResponse } from "@/lib/adminModeration";
import styles from "./page.module.css";
import { formatAdminDate } from "./moderationPresentation";

const identityVerificationStatusLabels = {
  pending: "確認待ち",
  verified: "本人と確認済み",
  rejected: "確認できず",
  expired: "投稿期限切れ",
};
const moderationCaseStatusLabels = {
  correctionRequired: "非公開・修正が必要",
  postReviewPending: "管理者確認待ち（非公開）",
  preReviewPending: "管理者確認待ち（非公開）",
  confirmed: "確認済み",
};
const moderationReasonLabels = {
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

type IdentityVerificationRequests =
  ModerationDetailResponse["profile"]["identityVerificationRequests"];
type ProfileLinks = ModerationDetailResponse["profile"]["links"];

type AdminIdentityVerificationPanelProps = {
  requests: IdentityVerificationRequests;
  profileLinks: ProfileLinks;
  onReload: () => Promise<void>;
  onActionMessage: (message: string) => void;
};

export default function AdminIdentityVerificationPanel({
  requests,
  profileLinks,
  onReload,
  onActionMessage,
}: AdminIdentityVerificationPanelProps) {
  const [verificationNotes, setVerificationNotes] = useState<
    Record<string, string>
  >({});
  const [updatingVerificationId, setUpdatingVerificationId] = useState("");
  const [verificationError, setVerificationError] = useState("");

  const reviewIdentityVerification = async (
    requestId: string,
    decision: "verified" | "rejected",
  ) => {
    const note = verificationNotes[requestId]?.trim() ?? "";
    if (!note || updatingVerificationId) {
      return;
    }

    setUpdatingVerificationId(requestId);
    setVerificationError("");
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
        `/api/admin/moderation/identity-verification/${encodeURIComponent(requestId)}`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ decision, note }),
        },
      );
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          result.error || "本人確認の審査結果を保存できませんでした。",
        );
      }

      setVerificationNotes((current) => ({ ...current, [requestId]: "" }));
      await onReload();
      onActionMessage(
        decision === "verified"
          ? "本人確認を完了し、なりすまし違反の取り消しを記録しました。"
          : "本人確認できない理由をユーザーへ通知しました。",
      );
    } catch (reviewError) {
      setVerificationError(
        reviewError instanceof Error
          ? reviewError.message
          : "本人確認の審査結果を保存できませんでした。",
      );
    } finally {
      setUpdatingVerificationId("");
    }
  };

  return (
    <section
      className={styles.panel}
      aria-labelledby="identity-verification-heading"
    >
      <div className={styles.sectionHeading}>
        <h2 id="identity-verification-heading">本人確認申請</h2>
        <span>最新{requests.length}件</span>
      </div>
      {verificationError ? (
        <p className={styles.actionError} role="alert">
          {verificationError}
        </p>
      ) : null}
      {requests.length ? (
        <ol className={styles.reportList}>
          {requests.map((verificationRequest) => {
            const targetLink =
              verificationRequest.moderationCase.targetType === "socialLink"
                ? profileLinks.find(
                    (link) =>
                      link.id === verificationRequest.moderationCase.targetId,
                  )
                : null;
            return (
              <li key={verificationRequest.id}>
                <div className={styles.reportHeader}>
                  <strong>登録SNSによる本人確認</strong>
                  <span
                    className={`${styles.reportStatus} ${
                      styles[verificationRequest.status]
                    }`}
                  >
                    {
                      identityVerificationStatusLabels[
                        verificationRequest.status
                      ]
                    }
                  </span>
                </div>
                <div className={styles.verificationDetails}>
                  <section className={styles.verificationTarget}>
                    <h3>審査・違反取消の対象</h3>
                    <p>
                      ケースID：
                      <code>{verificationRequest.moderationCase.id}</code>
                    </p>
                    <strong>
                      {verificationRequest.moderationCase.targetType ===
                      "profile"
                        ? "プロフィール全体"
                        : verificationRequest.moderationCase.targetType ===
                            "socialLink"
                          ? targetLink
                            ? `リンク：${targetLink.label || targetLink.service}`
                            : `リンク（現在は削除または存在しません：${verificationRequest.moderationCase.targetId}）`
                          : "音声"}
                    </strong>
                    {targetLink ? (
                      <p>
                        {targetLink.service}：{targetLink.url}
                      </p>
                    ) : verificationRequest.moderationCase.targetType ===
                      "socialLink" ? (
                      <p>
                        対象リンクID：
                        {verificationRequest.moderationCase.targetId}
                      </p>
                    ) : null}
                    <p>
                      理由：
                      {
                        moderationReasonLabels[
                          verificationRequest.moderationCase.reasonCode
                        ]
                      }{" "}
                      / 状態：
                      {
                        moderationCaseStatusLabels[
                          verificationRequest.moderationCase.status
                        ]
                      }
                    </p>
                    <p>{verificationRequest.moderationCase.userMessage}</p>
                  </section>
                  <section className={styles.verificationEvidence}>
                    <h3>本人確認の証拠SNS</h3>
                    <p>申請時URL：{verificationRequest.socialUrl}</p>
                    {verificationRequest.socialLink ? (
                      <p>
                        現在の登録内容：
                        {verificationRequest.socialLink.label ||
                          verificationRequest.socialLink.service}
                        （{verificationRequest.socialLink.url}）
                      </p>
                    ) : (
                      <p>現在の登録SNSは確認できません（申請時URLを使用）。</p>
                    )}
                  </section>
                </div>
                <dl className={styles.definitionList}>
                  <div>
                    <dt>投稿予定内容</dt>
                    <dd>{verificationRequest.plannedContent}</dd>
                  </div>
                  <div>
                    <dt>申請日時</dt>
                    <dd>{formatAdminDate(verificationRequest.createdAt)}</dd>
                  </div>
                  <div>
                    <dt>投稿期限</dt>
                    <dd>
                      <time dateTime={verificationRequest.postingDeadlineAt}>
                        {formatAdminDate(verificationRequest.postingDeadlineAt)}
                      </time>
                    </dd>
                  </div>
                </dl>
                <a
                  className={styles.evidenceLink}
                  href={verificationRequest.socialUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  申請時のSNSを確認する
                </a>
                {verificationRequest.reviewNote ? (
                  <p className={styles.reportReviewNote}>
                    審査メモ: {verificationRequest.reviewNote}
                  </p>
                ) : null}
                {verificationRequest.reviewedAt ? (
                  <p className={styles.reportReviewer}>
                    審査日時: {formatAdminDate(verificationRequest.reviewedAt)}{" "}
                    / {verificationRequest.reviewerRole ?? "不明"} /{" "}
                    {verificationRequest.reviewerIdentifier ?? "記録なし"}
                  </p>
                ) : null}
                {verificationRequest.status === "pending" ? (
                  <div className={styles.requestResolution}>
                    <label
                      htmlFor={`verification-note-${verificationRequest.id}`}
                    >
                      審査メモ・ユーザーへの説明（必須）
                    </label>
                    <textarea
                      id={`verification-note-${verificationRequest.id}`}
                      value={verificationNotes[verificationRequest.id] ?? ""}
                      maxLength={500}
                      rows={4}
                      onChange={(event) =>
                        setVerificationNotes((current) => ({
                          ...current,
                          [verificationRequest.id]: event.target.value,
                        }))
                      }
                    />
                    <div className={styles.reportActions}>
                      <button
                        type="button"
                        disabled={
                          updatingVerificationId === verificationRequest.id ||
                          !verificationNotes[verificationRequest.id]?.trim()
                        }
                        onClick={() =>
                          void reviewIdentityVerification(
                            verificationRequest.id,
                            "verified",
                          )
                        }
                      >
                        本人と確認
                      </button>
                      <button
                        type="button"
                        disabled={
                          updatingVerificationId === verificationRequest.id ||
                          !verificationNotes[verificationRequest.id]?.trim()
                        }
                        onClick={() =>
                          void reviewIdentityVerification(
                            verificationRequest.id,
                            "rejected",
                          )
                        }
                      >
                        確認できない
                      </button>
                    </div>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ol>
      ) : (
        <p>本人確認申請はありません。</p>
      )}
    </section>
  );
}
