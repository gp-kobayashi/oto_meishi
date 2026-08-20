"use client";

import Link from "next/link";
import { useState } from "react";
import { getAuthErrorPresentation } from "@/lib/authErrorMessages";
import { supabase } from "@/lib/supabaseClient";
import styles from "./PasswordResetRequestForm.module.css";

export default function PasswordResetForm() {
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isComplete, setIsComplete] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("パスワードは8文字以上で入力してください。");
      return;
    }

    if (password !== passwordConfirmation) {
      setError("確認用パスワードが一致しません。");
      return;
    }

    setIsSubmitting(true);

    try {
      if (!supabase) {
        const presentation = getAuthErrorPresentation(
          { code: "client_not_configured" },
          "passwordUpdate",
        );
        setError(presentation.message);
        console.error(presentation.logContext);
        return;
      }

      const { error } = await supabase.auth.updateUser({ password });

      if (error) {
        const presentation = getAuthErrorPresentation(error, "passwordUpdate");
        setError(presentation.message);
        console.error(presentation.logContext);
        return;
      }

      setIsComplete(true);
    } catch (err) {
      const presentation = getAuthErrorPresentation(err, "passwordUpdate");
      setError(presentation.message);
      console.error(presentation.logContext);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isComplete) {
    return (
      <div className={styles.panel}>
        <p className={styles.message} role="status">
          パスワードを更新しました。新しいパスワードでログインできます。
        </p>
        <p className={styles.navigation}>
          <Link href="/login" className={styles.navigationLink}>
            ログイン画面へ
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className={styles.panel}>
      <form className={styles.form} onSubmit={handleSubmit}>
        <label className={styles.label} htmlFor="new-password">
          新しいパスワード
        </label>
        <input
          className={styles.input}
          id="new-password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          placeholder="8文字以上"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />

        <label className={styles.label} htmlFor="password-confirmation">
          新しいパスワード（確認）
        </label>
        <input
          className={styles.input}
          id="password-confirmation"
          name="passwordConfirmation"
          type="password"
          autoComplete="new-password"
          minLength={8}
          placeholder="もう一度入力"
          required
          value={passwordConfirmation}
          onChange={(event) => setPasswordConfirmation(event.target.value)}
        />

        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}

        <button
          className={styles.submitButton}
          type="submit"
          disabled={isSubmitting}
        >
          {isSubmitting ? "更新中..." : "パスワードを更新"}
        </button>
      </form>
    </div>
  );
}
