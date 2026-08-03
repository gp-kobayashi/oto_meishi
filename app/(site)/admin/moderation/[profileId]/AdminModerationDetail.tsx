"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { ModerationDetailResponse } from "@/lib/adminModeration";
import styles from "./page.module.css";
import AdminAudioPlayer from "@/components/admin/AdminAudioPlayer";

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

const moderationCaseStatusLabels = {
  correctionRequired: "修正待ち",
  postReviewPending: "事後確認待ち（公開中）",
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

const moderationReasonLabels = {
  inappropriateContent: "不適切な内容",
  copyrightConcern: "著作権に関する問題",
  harassment: "誹謗中傷",
  unsafeLink: "安全でないリンク",
  serviceMismatch: "選択サービスとURLの不一致",
  impersonation: "なりすまし",
  other: "その他",
};

const linkStatusLabels = {
  active: "公開中",
  hidden: "非公開",
};

const targetTypeLabels = {
  profile: "プロフィール",
  audio: "音声",
  socialLink: "リンク",
};

const profileFieldLabels = {
  displayName: "表示名",
  bio: "自己紹介",
  theme: "テーマ",
} as const;

const actionLabels = {
  hide: "非公開",
  restore: "復旧",
  suspend: "利用停止",
  remove: "削除",
};

const reportReasonLabels = {
  inappropriate_audio: "不適切な音声",
  harassment: "誹謗中傷・嫌がらせ",
  unsafe_link: "危険または不正なリンク",
  impersonation: "なりすまし",
  other: "その他",
};

const moderationReasonOptions = [
  { value: "inappropriateContent", label: "不適切な内容" },
  { value: "copyrightConcern", label: "著作権に関する問題" },
  { value: "harassment", label: "誹謗中傷" },
  { value: "unsafeLink", label: "安全でないリンク" },
  { value: "serviceMismatch", label: "選択サービスとURLの不一致" },
  { value: "impersonation", label: "なりすまし" },
  { value: "other", label: "その他" },
] as const;

const reportStatusLabels = {
  pending: "未確認",
  reviewed: "確認済み",
  resolved: "対応済み",
  dismissed: "対応不要",
};

const requestKindLabels = {
  inquiry: "モデレーション問い合わせ",
  accountAppeal: "利用停止解除申請",
};

const requestStatusLabels = {
  pending: "確認中",
  resolved: "承認・回答済み",
  rejected: "却下",
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

const formatSnapshotContent = (content: unknown) => {
  if (
    typeof content !== "object" ||
    content === null ||
    Array.isArray(content)
  ) {
    return String(content ?? "記録なし");
  }
  const entries = Object.entries(content);
  if (!entries.length) return "記録なし";
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
  if (!Array.isArray(changedFields)) return [];

  return changedFields.filter(
    (field): field is keyof typeof profileFieldLabels =>
      typeof field === "string" && field in profileFieldLabels,
  );
};

type PendingAction = {
  targetType: "profile" | "audio" | "socialLink";
  targetId: string;
  action: "hide" | "restore" | "suspend";
  targetLabel: string;
  actionLabel: string;
};

type PendingReportAction = {
  reportId: string;
  status: "reviewed" | "resolved" | "dismissed";
  statusLabel: string;
};

export default function AdminModerationDetail({ profileId }: { profileId: string }) {
  const [data, setData] = useState<ModerationDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [reason, setReason] = useState("");
  const [reasonCode, setReasonCode] = useState<
    (typeof moderationReasonOptions)[number]["value"]
  >("inappropriateContent");
  const [actionError, setActionError] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [updatingReportId, setUpdatingReportId] = useState("");
  const [reportError, setReportError] = useState("");
  const [pendingReportAction, setPendingReportAction] =
    useState<PendingReportAction | null>(null);
  const [reportNote, setReportNote] = useState("");
  const [requestResponses, setRequestResponses] = useState<
    Record<string, string>
  >({});
  const [updatingRequestId, setUpdatingRequestId] = useState("");
  const [requestError, setRequestError] = useState("");
  const [caseResponses, setCaseResponses] = useState<Record<string, string>>(
    {},
  );
  const [updatingCaseId, setUpdatingCaseId] = useState("");
  const [caseError, setCaseError] = useState("");

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
    setReasonCode("inappropriateContent");
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
          ...(pendingAction.action === "hide" ? { reasonCode } : {}),
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

  const updateReportStatus = async (
    reportId: string,
    status: "reviewed" | "resolved" | "dismissed",
    note: string,
  ) => {
    if (updatingReportId) return;

    setUpdatingReportId(reportId);
    setReportError("");
    setActionMessage("");
    try {
      if (!supabase) throw new Error("認証クライアントが初期化されていません。");
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error("管理者アカウントでログインしてください。");

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

      await loadDetail();
      setPendingReportAction(null);
      setReportNote("");
      setActionMessage(`通報を「${reportStatusLabels[status]}」に変更しました。`);
    } catch (updateError) {
      setReportError(
        updateError instanceof Error
          ? updateError.message
          : "通報状態を変更できませんでした。",
      );
    } finally {
      setUpdatingReportId("");
    }
  };

  const resolveModerationRequest = async (
    requestId: string,
    status: "resolved" | "rejected",
  ) => {
    const responseMessage = requestResponses[requestId]?.trim() ?? "";
    if (!responseMessage || updatingRequestId) return;

    setUpdatingRequestId(requestId);
    setRequestError("");
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
        `/api/admin/moderation/requests/${encodeURIComponent(requestId)}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ status, responseMessage }),
        },
      );
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.error || "申請へ回答できませんでした。");
      }
      setRequestResponses((current) => ({ ...current, [requestId]: "" }));
      await loadDetail();
      setActionMessage("申請への回答を保存しました。");
    } catch (resolveError) {
      setRequestError(
        resolveError instanceof Error
          ? resolveError.message
          : "申請へ回答できませんでした。",
      );
    } finally {
      setUpdatingRequestId("");
    }
  };

  const reviewModerationCase = async (
    caseId: string,
    decision: "approve" | "continueHidden" | "requestChanges",
    reviewedSnapshotId: string | null,
  ) => {
    const reviewReason = caseResponses[caseId]?.trim() ?? "";
    if (!reviewReason || updatingCaseId) return;

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
      await loadDetail();
      setActionMessage("審査結果を保存し、ユーザーへ通知しました。");
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
              {data.profile.deletedAudio ? (
                <div className={styles.deletedAudioNotice}>
                  <div className={styles.deletedAudioHeading}>
                    <strong>削除済み音声の対応状況</strong>
                    <span className={styles.reviewStatus}>
                      {
                        moderationCaseStatusLabels[
                          data.profile.deletedAudio.status
                        ]
                      }
                    </span>
                  </div>
                  <dl className={styles.deletedAudioDetails}>
                    <div>
                      <dt>削除前のタイトル</dt>
                      <dd>
                        {data.profile.deletedAudio.previousTitle ||
                          "タイトルなし"}
                      </dd>
                    </div>
                    <div>
                      <dt>削除前の状態</dt>
                      <dd>
                        {data.profile.deletedAudio.previousStatus ||
                          "確認できません"}
                      </dd>
                    </div>
                    <div>
                      <dt>削除日時</dt>
                      <dd>
                        {data.profile.deletedAudio.deletedAt
                          ? formatDate(data.profile.deletedAudio.deletedAt)
                          : "確認できません"}
                      </dd>
                    </div>
                    <div>
                      <dt>実行者</dt>
                      <dd>
                        {data.profile.deletedAudio.deletedByType &&
                        data.profile.deletedAudio.deletedByIdentifier
                          ? `${data.profile.deletedAudio.deletedByType} / ${data.profile.deletedAudio.deletedByIdentifier}`
                          : "確認できません"}
                      </dd>
                    </div>
                    <div>
                      <dt>確認期限</dt>
                      <dd>
                        {formatDate(data.profile.deletedAudio.reviewDueAt)}
                      </dd>
                    </div>
                  </dl>
                  <p className={styles.deletedAudioNote}>
                    削除前の音声は確認期限まで管理者確認用として保持されます。
                  </p>
                </div>
              ) : null}
              {data.profile.hasAudio ? (
                <AdminAudioPlayer profileId={data.profile.id} />
              ) : null}
              {data.profile.hasAudio && data.profile.audioStatus !== "removed" ? (
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

            <section className={styles.panel} aria-labelledby="cases-heading">
              <div className={styles.sectionHeading}>
                <h2 id="cases-heading">修正内容と審査状況</h2>
                <span>最新{data.profile.moderationCases.length}件</span>
              </div>
              {caseError ? (
                <p className={styles.actionError} role="alert">
                  {caseError}
                </p>
              ) : null}
              {data.profile.moderationCases.length ? (
                <ol className={styles.caseList}>
                  {data.profile.moderationCases.map((moderationCase) => {
                    const reportedSnapshots =
                      moderationCase.snapshots.filter(
                        (snapshot) => snapshot.kind === "reported",
                      );
                    const correctedSnapshots =
                      moderationCase.snapshots.filter(
                        (snapshot) => snapshot.kind === "corrected",
                      );
                    const latestReported = reportedSnapshots.at(-1);
                    const latestCorrected = correctedSnapshots.at(-1);
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
                            {
                              moderationCaseStatusLabels[
                                moderationCase.status
                              ]
                            }
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
                                    profileId={data.profile.id}
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
                                (latestCorrected.hasStoredAudio ||
                                  data.profile.hasAudio) ? (
                                  <AdminAudioPlayer
                                    profileId={data.profile.id}
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
                                  {
                                    moderationCaseEventLabels[
                                      caseEvent.eventType
                                    ]
                                  }
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
                          <p className={styles.emptyHistory}>
                            操作履歴はありません。
                          </p>
                        )}
                        {isPending ? (
                          <div className={styles.caseReview}>
                            <label
                              htmlFor={`case-response-${moderationCase.id}`}
                            >
                              ユーザーに通知する審査理由（必須）
                            </label>
                            <textarea
                              id={`case-response-${moderationCase.id}`}
                              maxLength={500}
                              rows={4}
                              value={
                                caseResponses[moderationCase.id] ?? ""
                              }
                              onChange={(event) =>
                                setCaseResponses((current) => ({
                                  ...current,
                                  [moderationCase.id]: event.target.value,
                                }))
                              }
                            />
                            {moderationCase.reviewMode === "postReview" ? (
                              <p className={styles.reviewWarning}>
                                事後確認で非公開継続または追加修正を選ぶと、アカウントを利用停止します。
                              </p>
                            ) : null}
                            <div className={styles.reportActions}>
                              <button
                                type="button"
                                disabled={
                                  updatingCaseId === moderationCase.id ||
                                  !latestCorrected ||
                                  !caseResponses[
                                    moderationCase.id
                                  ]?.trim()
                                }
                                onClick={() =>
                                  void reviewModerationCase(
                                    moderationCase.id,
                                    "approve",
                                    latestCorrected?.id ?? null,
                                  )
                                }
                              >
                                修正を承認
                              </button>
                              <button
                                type="button"
                                disabled={
                                  updatingCaseId === moderationCase.id ||
                                  !caseResponses[
                                    moderationCase.id
                                  ]?.trim()
                                }
                                onClick={() =>
                                  void reviewModerationCase(
                                    moderationCase.id,
                                    "continueHidden",
                                    latestCorrected?.id ?? null,
                                  )
                                }
                              >
                                非公開を継続
                              </button>
                              <button
                                type="button"
                                disabled={
                                  updatingCaseId === moderationCase.id ||
                                  !caseResponses[
                                    moderationCase.id
                                  ]?.trim()
                                }
                                onClick={() =>
                                  void reviewModerationCase(
                                    moderationCase.id,
                                    "requestChanges",
                                    latestCorrected?.id ?? null,
                                  )
                                }
                              >
                                追加修正を依頼
                              </button>
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

            <section className={styles.panel} aria-labelledby="requests-heading">
              <div className={styles.sectionHeading}>
                <h2 id="requests-heading">問い合わせ・解除申請</h2>
                <span>
                  最新{(data.profile.moderationRequests ?? []).length}件
                </span>
              </div>
              {requestError ? (
                <p className={styles.actionError} role="alert">
                  {requestError}
                </p>
              ) : null}
              {(data.profile.moderationRequests ?? []).length ? (
                <ol className={styles.reportList}>
                  {(data.profile.moderationRequests ?? []).map(
                    (moderationRequest) => (
                      <li key={moderationRequest.id}>
                        <div className={styles.reportHeader}>
                          <strong>
                            {requestKindLabels[moderationRequest.kind]}
                          </strong>
                          <span
                            className={`${styles.reportStatus} ${
                              styles[moderationRequest.status]
                            }`}
                          >
                            {requestStatusLabels[moderationRequest.status]}
                          </span>
                        </div>
                        <p className={styles.reportDetails}>
                          {moderationRequest.message}
                        </p>
                        <time dateTime={moderationRequest.createdAt}>
                          申請日時: {formatDate(moderationRequest.createdAt)}
                        </time>
                        {moderationRequest.responseMessage ? (
                          <p className={styles.reportReviewNote}>
                            回答: {moderationRequest.responseMessage}
                          </p>
                        ) : null}
                        {moderationRequest.status === "pending" ? (
                          <div className={styles.requestResolution}>
                            <label
                              htmlFor={`request-response-${moderationRequest.id}`}
                            >
                              ユーザー向け回答（必須）
                            </label>
                            <textarea
                              id={`request-response-${moderationRequest.id}`}
                              value={
                                requestResponses[moderationRequest.id] ?? ""
                              }
                              maxLength={500}
                              rows={4}
                              onChange={(event) =>
                                setRequestResponses((current) => ({
                                  ...current,
                                  [moderationRequest.id]: event.target.value,
                                }))
                              }
                            />
                            <div className={styles.reportActions}>
                              <button
                                type="button"
                                disabled={
                                  updatingRequestId === moderationRequest.id ||
                                  !requestResponses[
                                    moderationRequest.id
                                  ]?.trim()
                                }
                                onClick={() =>
                                  void resolveModerationRequest(
                                    moderationRequest.id,
                                    "resolved",
                                  )
                                }
                              >
                                {moderationRequest.kind === "accountAppeal"
                                  ? "解除を承認"
                                  : "回答して完了"}
                              </button>
                              <button
                                type="button"
                                disabled={
                                  updatingRequestId === moderationRequest.id ||
                                  !requestResponses[
                                    moderationRequest.id
                                  ]?.trim()
                                }
                                onClick={() =>
                                  void resolveModerationRequest(
                                    moderationRequest.id,
                                    "rejected",
                                  )
                                }
                              >
                                申請を却下
                              </button>
                            </div>
                          </div>
                        ) : null}
                      </li>
                    ),
                  )}
                </ol>
              ) : (
                <p>問い合わせ・解除申請はありません。</p>
              )}
            </section>

            <section className={styles.panel} aria-labelledby="reports-heading">
              <div className={styles.sectionHeading}>
                <h2 id="reports-heading">通報</h2>
                <span>最新{data.profile.reports.length}件</span>
              </div>
              {data.profile.reports.length ? (
                <ol className={styles.reportList}>
                  {data.profile.reports.map((report) => (
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
                          最終変更: {formatDate(report.reviewedAt)} / {report.reviewerRole} / {report.reviewerIdentifier}
                        </p>
                      ) : null}
                      {report.reviewNote ? (
                        <p className={styles.reportReviewNote}>
                          対応メモ: {report.reviewNote}
                        </p>
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
              {data.profile.reports.length === 50 ? (
                <p className={styles.historyNote}>最新50件を表示しています。</p>
              ) : null}
              {reportError ? (
                <p className={styles.actionError} role="alert">
                  {reportError}
                </p>
              ) : null}
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
                        実行者: {entry.adminRole} / {entry.adminIdentifier}
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
                    {pendingAction.action === "hide" ? (
                      <>
                        <label htmlFor="moderation-reason-code">
                          違反分類（必須）
                        </label>
                        <select
                          id="moderation-reason-code"
                          value={reasonCode}
                          onChange={(event) =>
                            setReasonCode(
                              event.target.value as typeof reasonCode,
                            )
                          }
                        >
                          {moderationReasonOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                        <p className={styles.reviewModeHelp}>
                          誹謗中傷・なりすまし・その他は確認完了まで非公開、それ以外は修正後に公開して事後確認します。
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
                      if (!reportNote.trim()) return;
                      void updateReportStatus(
                        pendingReportAction.reportId,
                        pendingReportAction.status,
                        reportNote.trim(),
                      );
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
                    <p className={styles.characterCount}>
                      {reportNote.length} / 500
                    </p>
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
          </article>
        ) : null}
      </div>
    </section>
  );
}
