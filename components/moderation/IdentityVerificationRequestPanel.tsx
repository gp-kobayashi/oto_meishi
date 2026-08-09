"use client";

import { FormEvent, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import styles from "./IdentityVerificationRequestPanel.module.css";

type VerificationSocialLink = {
  id?: string;
  label: string;
  service: string;
  url: string;
};

type CreatedRequest = {
  socialUrl: string;
  plannedContent: string;
  postingDeadlineAt: string;
};

export default function IdentityVerificationRequestPanel({
  moderationCaseId,
  socialLinks,
}: {
  moderationCaseId: string;
  socialLinks: VerificationSocialLink[];
}) {
  const selectableLinks = socialLinks.filter(
    (link): link is VerificationSocialLink & { id: string } =>
      Boolean(link.id && link.url),
  );
  const [socialLinkId, setSocialLinkId] = useState(
    selectableLinks[0]?.id ?? "",
  );
  const [plannedContent, setPlannedContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [createdRequest, setCreatedRequest] =
    useState<CreatedRequest | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");

    const content = plannedContent.trim();
    if (!socialLinkId) {
      setError("本人確認に使用する登録済みSNSを選択してください。");
      return;
    }
    if (!content || content.length > 500) {
      setError("投稿予定内容を1文字以上500文字以内で入力してください。");
      return;
    }
    if (!supabase) {
      setError("認証クライアントが初期化されていません。");
      return;
    }

    setSubmitting(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        throw new Error("セッションがありません。再度ログインしてください。");
      }

      const response = await fetch(
        "/api/moderation/identity-verification",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            moderationCaseId,
            socialLinkId,
            plannedContent: content,
          }),
        },
      );
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.error || "本人確認申請を送信できませんでした。");
      }

      setCreatedRequest(result as CreatedRequest);
      setPlannedContent(content);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "本人確認申請を送信できませんでした。",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className={styles.panel} aria-labelledby="identity-verification-title">
      <div className={styles.header}>
        <div>
          <p className={styles.eyebrow}>本人確認</p>
          <h2 id="identity-verification-title">登録SNSへの投稿で確認する</h2>
        </div>
        <span>身分証は不要です</span>
      </div>

      {createdRequest ? (
        <div className={styles.success} role="status">
          <strong>投稿予定を受け付けました。</strong>
          <p>
            次の期限までに、申請した内容と一致する投稿を行ってください。
          </p>
          <p>
            投稿期限：
            <time dateTime={createdRequest.postingDeadlineAt}>
              {new Intl.DateTimeFormat("ja-JP", {
                dateStyle: "medium",
                timeStyle: "short",
              }).format(new Date(createdRequest.postingDeadlineAt))}
            </time>
          </p>
          <p className={styles.submittedContent}>
            申請内容：{createdRequest.plannedContent}
          </p>
          <a href={createdRequest.socialUrl} target="_blank" rel="noreferrer">
            投稿先のSNSを開く
          </a>
          <p>
            投稿後は管理者が内容を確認します。確認が終わるまでプロフィールは公開されません。
          </p>
        </div>
      ) : (
        <form className={styles.form} onSubmit={submit}>
          <p>
            先に投稿予定を申請し、申請後10分以内に登録SNSへ投稿してください。
            定型文でなくても、短い文章や投稿する写真の説明で構いません。
          </p>
          <p className={styles.caution}>
            SNSリンクを変更した場合は、先にプロフィールの変更を保存してください。
          </p>

          <label htmlFor="identity-verification-social-link">
            本人確認に使用する登録済みSNS
          </label>
          <select
            id="identity-verification-social-link"
            value={socialLinkId}
            onChange={(event) => setSocialLinkId(event.target.value)}
            disabled={!selectableLinks.length || submitting}
          >
            {!selectableLinks.length ? (
              <option value="">登録済みSNSがありません</option>
            ) : null}
            {selectableLinks.map((link) => (
              <option key={link.id} value={link.id}>
                {link.label || link.service}（{link.url}）
              </option>
            ))}
          </select>

          <div className={styles.labelRow}>
            <label htmlFor="identity-verification-content">投稿予定内容</label>
            <span>{plannedContent.length}/500</span>
          </div>
          <textarea
            id="identity-verification-content"
            value={plannedContent}
            onChange={(event) => setPlannedContent(event.target.value)}
            maxLength={500}
            rows={4}
            placeholder="例：カフェで撮ったコーヒーの写真を投稿します"
            disabled={submitting}
          />

          {error ? <p className={styles.error}>{error}</p> : null}
          <button
            type="submit"
            disabled={submitting || !selectableLinks.length}
          >
            {submitting ? "申請中..." : "投稿予定を申請する"}
          </button>
        </form>
      )}
    </section>
  );
}
