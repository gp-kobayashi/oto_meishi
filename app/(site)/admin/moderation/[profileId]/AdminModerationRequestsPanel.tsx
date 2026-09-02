"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { ModerationDetailResponse } from "@/lib/adminModeration";
import styles from "./page.module.css";
import { formatAdminDate } from "./moderationPresentation";

const requestKindLabels = {
  inquiry: "モデレーション問い合わせ",
  accountAppeal: "利用停止解除申請",
};

const requestStatusLabels = {
  pending: "確認中",
  resolved: "承認・回答済み",
  rejected: "却下",
};

type Props = {
  requests: ModerationDetailResponse["profile"]["moderationRequests"];
  onReload: () => Promise<void>;
  onActionMessage: (message: string) => void;
};

export default function AdminModerationRequestsPanel({
  requests,
  onReload,
  onActionMessage,
}: Props) {
  const [requestResponses, setRequestResponses] = useState<
    Record<string, string>
  >({});
  const [updatingRequestId, setUpdatingRequestId] = useState("");
  const [requestError, setRequestError] = useState("");

  const resolveModerationRequest = async (
    requestId: string,
    status: "resolved" | "rejected",
  ) => {
    const responseMessage = requestResponses[requestId]?.trim() ?? "";
    if (!responseMessage || updatingRequestId) {
      return;
    }

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
      await onReload();
      onActionMessage("申請への回答を保存しました。");
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

  const requestList = requests ?? [];

  return (
    <section className={styles.panel} aria-labelledby="requests-heading">
      <div className={styles.sectionHeading}>
        <h2 id="requests-heading">問い合わせ・解除申請</h2>
        <span>
          {requestList.length}件（未処理は全件・履歴は最新50件）
        </span>
      </div>
      {requestError ? (
        <p className={styles.actionError} role="alert">
          {requestError}
        </p>
      ) : null}
      {requestList.length ? (
        <ol className={styles.reportList}>
          {requestList.map((moderationRequest) => (
            <li key={moderationRequest.id}>
              <div className={styles.reportHeader}>
                <strong>{requestKindLabels[moderationRequest.kind]}</strong>
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
                申請日時: {formatAdminDate(moderationRequest.createdAt)}
              </time>
              {moderationRequest.responseMessage ? (
                <p className={styles.reportReviewNote}>
                  回答: {moderationRequest.responseMessage}
                </p>
              ) : null}
              {moderationRequest.status === "pending" ? (
                <div className={styles.requestResolution}>
                  <label htmlFor={`request-response-${moderationRequest.id}`}>
                    ユーザー向け回答（必須）
                  </label>
                  <textarea
                    id={`request-response-${moderationRequest.id}`}
                    value={requestResponses[moderationRequest.id] ?? ""}
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
                        !requestResponses[moderationRequest.id]?.trim()
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
                        !requestResponses[moderationRequest.id]?.trim()
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
          ))}
        </ol>
      ) : (
        <p>問い合わせ・解除申請はありません。</p>
      )}
    </section>
  );
}
