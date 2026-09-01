"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import type { ModerationDetailResponse } from "@/lib/adminModeration";
import AdminAudioPlayer from "@/components/admin/AdminAudioPlayer";
import styles from "./page.module.css";
import {
  audioStatusLabels,
  formatAdminDate,
  linkStatusLabels,
  moderationCaseStatusLabels,
} from "./moderationPresentation";

const moderationReasonOptions = [
  { value: "inappropriateContent", label: "不適切な内容" },
  { value: "copyrightConcern", label: "著作権に関する問題" },
  { value: "harassment", label: "誹謗中傷" },
  { value: "unsafeLink", label: "安全でないリンク" },
  { value: "serviceMismatch", label: "選択サービスとURLの不一致" },
  { value: "impersonation", label: "なりすまし" },
  { value: "threatOrPersonalData", label: "脅迫・第三者の個人情報" },
  {
    value: "unofficialThirdPartyProfile",
    label: "他人を主体としたプロフィール",
  },
  { value: "politicalReligiousPromotion", label: "政治・宗教への勧誘・宣伝" },
  { value: "other", label: "その他" },
] as const;
type ModerationReasonCode = (typeof moderationReasonOptions)[number]["value"];
const pendingModerationCaseStatuses = new Set([
  "correctionRequired",
  "postReviewPending",
  "preReviewPending",
]);

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
interface AdminModeratedContentPanelProps {
  profile: ModerationDetailResponse["profile"];
  onReload: () => Promise<void>;
  onActionMessage: (message: string) => void;
}

export default function AdminModeratedContentPanel({
  profile,
  onReload,
  onActionMessage,
}: AdminModeratedContentPanelProps) {
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(
    null,
  );
  const [reason, setReason] = useState("");
  const [reasonCode, setReasonCode] = useState<ModerationReasonCode>(
    "inappropriateContent",
  );
  const [actionError, setActionError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const openAction = (action: PendingAction) => {
    setPendingAction(action);
    setReason("");
    setReasonCode("inappropriateContent");
    setActionError("");
    onActionMessage("");
  };
  const submitAction = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!pendingAction || !reason.trim() || submitting) {
      return;
    }
    setSubmitting(true);
    setActionError("");
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
      const response = await fetch("/api/admin/moderation/actions", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + session.access_token,
        },
        body: JSON.stringify({
          targetType: pendingAction.targetType,
          targetId: pendingAction.targetId,
          action: pendingAction.action,
          reason: reason.trim(),
          ...(pendingAction.action === "hide" ? { reasonCode } : {}),
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.error || "公開状態を変更できませんでした。");
      }
      const completedLabel =
        pendingAction.targetLabel +
        "を" +
        pendingAction.actionLabel +
        "にしました。";
      setPendingAction(null);
      setReason("");
      await onReload();
      onActionMessage(completedLabel);
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
  const isDirectRestoreBlocked = (
    targetType: PendingAction["targetType"],
    targetId: string,
  ) => {
    if (targetType === "profile" && profile.status === "suspended") {
      return true;
    }
    return profile.moderationCases.some(
      (moderationCase) =>
        moderationCase.targetType === targetType &&
        moderationCase.targetId === targetId &&
        pendingModerationCaseStatuses.has(moderationCase.status),
    );
  };
  return (
    <>
      <section className={styles.panel} aria-labelledby="profile-heading">
        <h2 id="profile-heading">プロフィール</h2>
        <dl className={styles.definitionList}>
          <div>
            <dt>自己紹介</dt>
            <dd className={styles.bio}>{profile.bio || "未登録"}</dd>
          </div>
          <div>
            <dt>テーマ</dt>
            <dd>{profile.theme}</dd>
          </div>
          <div>
            <dt>登録日時</dt>
            <dd>{formatAdminDate(profile.createdAt)}</dd>
          </div>
          <div>
            <dt>更新日時</dt>
            <dd>{formatAdminDate(profile.updatedAt)}</dd>
          </div>
        </dl>
        <Link
          className={styles.publicLink}
          href={`/${encodeURIComponent(profile.userId)}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          公開ページを別タブで確認
        </Link>
        <div className={styles.actions}>
          {profile.status === "active" ? (
            <>
              <button
                type="button"
                onClick={() =>
                  openAction({
                    targetType: "profile",
                    targetId: profile.id,
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
                    targetId: profile.id,
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
              disabled={isDirectRestoreBlocked("profile", profile.id)}
              onClick={() => {
                if (isDirectRestoreBlocked("profile", profile.id)) {
                  return;
                }
                openAction({
                  targetType: "profile",
                  targetId: profile.id,
                  action: "restore",
                  targetLabel: "プロフィール",
                  actionLabel: "公開中",
                });
              }}
            >
              プロフィールを復旧
            </button>
          )}
          {profile.status !== "active" &&
          isDirectRestoreBlocked("profile", profile.id) ? (
            <p className={styles.restoreBlocked}>
              {profile.status === "suspended"
                ? "利用停止の解除は、すべての修正審査後に解除申請から行ってください。"
                : "未完了の審査ケースがあります。ケースの「修正を承認」から再公開してください。"}
            </p>
          ) : null}
        </div>
      </section>

      <section className={styles.panel} aria-labelledby="audio-heading">
        <div className={styles.sectionHeading}>
          <h2 id="audio-heading">音声</h2>
          <span
            className={`${styles.smallBadge} ${styles[profile.audioStatus]}`}
          >
            {audioStatusLabels[profile.audioStatus]}
          </span>
        </div>
        <p className={styles.audioTitle}>
          {profile.audioTitle || "音声は登録されていません。"}
        </p>
        {profile.deletedAudio ? (
          <div className={styles.deletedAudioNotice}>
            <div className={styles.deletedAudioHeading}>
              <strong>削除済み音声の対応状況</strong>
              <span className={styles.reviewStatus}>
                {moderationCaseStatusLabels[profile.deletedAudio.status]}
              </span>
            </div>
            <dl className={styles.deletedAudioDetails}>
              <div>
                <dt>削除前のタイトル</dt>
                <dd>{profile.deletedAudio.previousTitle || "タイトルなし"}</dd>
              </div>
              <div>
                <dt>削除前の状態</dt>
                <dd>
                  {profile.deletedAudio.previousStatus || "確認できません"}
                </dd>
              </div>
              <div>
                <dt>削除日時</dt>
                <dd>
                  {profile.deletedAudio.deletedAt
                    ? formatAdminDate(profile.deletedAudio.deletedAt)
                    : "確認できません"}
                </dd>
              </div>
              <div>
                <dt>実行者</dt>
                <dd>
                  {profile.deletedAudio.deletedByType &&
                  profile.deletedAudio.deletedByIdentifier
                    ? `${profile.deletedAudio.deletedByType} / ${profile.deletedAudio.deletedByIdentifier}`
                    : "確認できません"}
                </dd>
              </div>
              <div>
                <dt>確認期限</dt>
                <dd>{formatAdminDate(profile.deletedAudio.reviewDueAt)}</dd>
              </div>
            </dl>
            <p className={styles.deletedAudioNote}>
              削除前の音声は確認期限まで管理者確認用として保持されます。
            </p>
          </div>
        ) : null}
        {profile.hasAudio ? <AdminAudioPlayer profileId={profile.id} /> : null}
        {profile.hasAudio && profile.audioStatus !== "removed" ? (
          <div className={styles.actions}>
            <button
              type="button"
              disabled={
                profile.audioStatus !== "active" &&
                isDirectRestoreBlocked("audio", profile.id)
              }
              onClick={() => {
                if (
                  profile.audioStatus !== "active" &&
                  isDirectRestoreBlocked("audio", profile.id)
                ) {
                  return;
                }
                openAction({
                  targetType: "audio",
                  targetId: profile.id,
                  action: profile.audioStatus === "active" ? "hide" : "restore",
                  targetLabel: "音声",
                  actionLabel:
                    profile.audioStatus === "active" ? "非公開" : "公開中",
                });
              }}
            >
              音声を
              {profile.audioStatus === "active" ? "非公開" : "復旧"}
            </button>
            {profile.audioStatus !== "active" &&
            isDirectRestoreBlocked("audio", profile.id) ? (
              <p className={styles.restoreBlocked}>
                未完了の審査ケースがあります。ケースの「修正を承認」から再公開してください。
              </p>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className={styles.panel} aria-labelledby="links-heading">
        <div className={styles.sectionHeading}>
          <h2 id="links-heading">リンク</h2>
          <span>{profile.links.length}件</span>
        </div>
        {profile.links.length ? (
          <div className={styles.links}>
            {profile.links.map((socialLink) => (
              <article
                className={styles.linkItem}
                id={`link-${socialLink.id}`}
                key={socialLink.id}
              >
                <div className={styles.linkHeading}>
                  <div>
                    <p className={styles.service}>{socialLink.service}</p>
                    <h3>{socialLink.label}</h3>
                  </div>
                  <span
                    className={`${styles.smallBadge} ${styles[socialLink.status]}`}
                  >
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
                    disabled={
                      socialLink.status !== "active" &&
                      isDirectRestoreBlocked("socialLink", socialLink.id)
                    }
                    onClick={() => {
                      if (
                        socialLink.status !== "active" &&
                        isDirectRestoreBlocked("socialLink", socialLink.id)
                      ) {
                        return;
                      }
                      openAction({
                        targetType: "socialLink",
                        targetId: socialLink.id,
                        action:
                          socialLink.status === "active" ? "hide" : "restore",
                        targetLabel: `リンク「${socialLink.label}」`,
                        actionLabel:
                          socialLink.status === "active" ? "非公開" : "公開中",
                      });
                    }}
                  >
                    リンクを
                    {socialLink.status === "active" ? "非公開" : "復旧"}
                  </button>
                  {socialLink.status !== "active" &&
                  isDirectRestoreBlocked("socialLink", socialLink.id) ? (
                    <p className={styles.restoreBlocked}>
                      未完了の審査ケースがあります。ケースの「修正を承認」から再公開してください。
                    </p>
                  ) : null}
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
            <p>
              実行すると管理操作履歴に管理者・理由・変更内容が保存されます。
            </p>
            {pendingAction.action !== "restore" ? (
              <p className={styles.reviewModeHelp}>
                この対象の未対応通報がある場合、ケースと操作履歴へ関連付けます。
              </p>
            ) : null}
            <form onSubmit={submitAction}>
              {pendingAction.action === "hide" ? (
                <>
                  <label htmlFor="moderation-reason-code">
                    違反分類（必須）
                  </label>
                  <select
                    id="moderation-reason-code"
                    value={reasonCode}
                    onChange={(event) =>
                      setReasonCode(event.target.value as ModerationReasonCode)
                    }
                  >
                    {moderationReasonOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <p className={styles.reviewModeHelp}>
                    すべての対象は、修正後も管理者の確認が完了するまで非公開です。
                  </p>
                </>
              ) : null}
              <label htmlFor="moderation-reason">
                ユーザーに表示する対応理由（必須）
              </label>
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
    </>
  );
}
