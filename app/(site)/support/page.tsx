"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import styles from "./page.module.css";

type RequestKind = "inquiry" | "accountAppeal";
type RequestStatus = "pending" | "resolved" | "rejected";

type ModerationRequest = {
  id: string;
  kind: RequestKind;
  status: RequestStatus;
  message: string;
  responseMessage: string;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type RequestResponse = {
  eligibility?: {
    kind: RequestKind | null;
    suspensionAppealDueAt: string | null;
  };
  requests?: ModerationRequest[];
  error?: string;
  retryAfterSeconds?: number;
};

const kindLabels: Record<RequestKind, string> = {
  inquiry: "モデレーション対応についての問い合わせ",
  accountAppeal: "利用停止の解除申請",
};

const statusLabels: Record<RequestStatus, string> = {
  pending: "確認中",
  resolved: "回答済み",
  rejected: "申請却下",
};

const formatDate = (value: string) =>
  new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));

const formatRetryAfter = (seconds: number) => {
  const hours = Math.ceil(seconds / 3600);
  return hours >= 24 ? `${Math.ceil(hours / 24)}日` : `${hours}時間`;
};

export default function SupportPage() {
  const [eligibility, setEligibility] = useState<
    RequestResponse["eligibility"]
  >();
  const [requests, setRequests] = useState<ModerationRequest[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const getAccessToken = useCallback(async () => {
    if (!supabase) {
      throw new Error("認証クライアントが初期化されていません。");
    }
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      throw new Error("ログインしてから申請してください。");
    }
    return session.access_token;
  }, []);

  const loadRequests = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const token = await getAccessToken();
      const response = await fetch("/api/moderation/requests", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = (await response.json().catch(() => ({}))) as RequestResponse;
      if (!response.ok) {
        throw new Error(result.error || "申請状況を取得できませんでした。");
      }
      setEligibility(result.eligibility);
      setRequests(result.requests ?? []);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "申請状況を取得できませんでした。",
      );
    } finally {
      setLoading(false);
    }
  }, [getAccessToken]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => void loadRequests(), 0);
    return () => window.clearTimeout(timeoutId);
  }, [loadRequests]);

  const submitRequest = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!message.trim() || submitting) return;

    setSubmitting(true);
    setError("");
    setSuccess("");
    try {
      const token = await getAccessToken();
      const response = await fetch("/api/moderation/requests", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ message: message.trim() }),
      });
      const result = (await response.json().catch(() => ({}))) as
        | ModerationRequest
        | RequestResponse;
      if (!response.ok) {
        const responseError = result as RequestResponse;
        const retryMessage =
          response.status === 429 && responseError.retryAfterSeconds
            ? ` 約${formatRetryAfter(responseError.retryAfterSeconds)}後に再度送信できます。`
            : "";
        throw new Error(
          (responseError.error || "申請を送信できませんでした。") +
            retryMessage,
        );
      }

      setMessage("");
      setSuccess("申請を受け付けました。運営の確認をお待ちください。");
      await loadRequests();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "申請を送信できませんでした。",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const pendingKind = requests.find(
    (request) =>
      request.status === "pending" && request.kind === eligibility?.kind,
  )?.kind;
  const canSubmit = Boolean(eligibility?.kind && !pendingKind);

  return (
    <main className={styles.main}>
      <section className={styles.hero}>
        <p className={styles.eyebrow}>MODERATION SUPPORT</p>
        <h1>対応状況と申請</h1>
        <p>
          非公開または利用停止の理由を確認したうえで、必要な修正や申請を行ってください。
        </p>
      </section>

      {loading ? (
        <p className={styles.message}>読み込み中...</p>
      ) : error && !eligibility ? (
        <div className={styles.error} role="alert">
          <p>{error}</p>
          <button type="button" onClick={() => void loadRequests()}>
            再読み込み
          </button>
        </div>
      ) : (
        <div className={styles.content}>
          <section className={styles.panel} aria-labelledby="request-heading">
            <h2 id="request-heading">
              {eligibility?.kind
                ? kindLabels[eligibility.kind]
                : "現在申請できる対応はありません"}
            </h2>
            {eligibility?.kind === "accountAppeal" ? (
              <>
                <p>
                  問題だと思われる箇所を確認し、対応した内容を具体的に記載してください。
                  内容を理解していない、または問題が継続していると判断した場合は解除されません。
                </p>
                {eligibility.suspensionAppealDueAt ? (
                  <p className={styles.deadline}>
                    申請期限：
                    <time dateTime={eligibility.suspensionAppealDueAt}>
                      {formatDate(eligibility.suspensionAppealDueAt)}
                    </time>
                  </p>
                ) : null}
              </>
            ) : eligibility?.kind === "inquiry" ? (
              <p>
                修正方法や表示されている理由について確認したい点を記載してください。
                コンテンツの修正自体は
                <Link href="/profile/edit">プロフィール編集画面</Link>
                から行えます。
              </p>
            ) : (
              <p>
                現在、非公開または利用停止に関する申請対象はありません。
              </p>
            )}

            {canSubmit ? (
              <form onSubmit={submitRequest}>
                <label htmlFor="support-message">申請内容（必須）</label>
                <textarea
                  id="support-message"
                  value={message}
                  maxLength={500}
                  rows={7}
                  onChange={(event) => setMessage(event.target.value)}
                />
                <div className={styles.formMeta}>
                  <span>{message.length} / 500</span>
                  <span>送信は1日5回まで</span>
                </div>
                <button
                  type="submit"
                  disabled={!message.trim() || submitting}
                >
                  {submitting ? "送信中..." : "申請を送信"}
                </button>
              </form>
            ) : pendingKind ? (
              <p className={styles.pendingNotice}>
                同じ種類の申請を確認中です。回答が届くまで重複して送信できません。
              </p>
            ) : null}
            {error ? (
              <p className={styles.inlineError} role="alert">
                {error}
              </p>
            ) : null}
            {success ? (
              <p className={styles.success} role="status">
                {success}
              </p>
            ) : null}
          </section>

          <section className={styles.panel} aria-labelledby="history-heading">
            <h2 id="history-heading">申請履歴</h2>
            {requests.length ? (
              <ol className={styles.history}>
                {requests.map((request) => (
                  <li key={request.id}>
                    <div className={styles.historyHeading}>
                      <strong>{kindLabels[request.kind]}</strong>
                      <span className={styles[request.status]}>
                        {statusLabels[request.status]}
                      </span>
                    </div>
                    <p>{request.message}</p>
                    <time dateTime={request.createdAt}>
                      申請日時：{formatDate(request.createdAt)}
                    </time>
                    {request.responseMessage ? (
                      <div className={styles.response}>
                        <strong>運営からの回答</strong>
                        <p>{request.responseMessage}</p>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ol>
            ) : (
              <p>申請履歴はありません。</p>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
