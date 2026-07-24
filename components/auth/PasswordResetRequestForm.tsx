"use client";

import Link from "next/link";
import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import styles from "./PasswordResetRequestForm.module.css";

const successMessage =
  "入力したメールアドレスが登録されている場合、パスワード再設定メールを送信しました。";

export default function PasswordResetRequestForm() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setIsSubmitting(true);

    try {
      if (!supabase) {
        setError(
          "Supabase の環境変数が設定されていません。まずは .env.local に URL と anon key を設定してください。",
        );
        return;
      }

      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (error) {
        throw error;
      }

      setMessage(successMessage);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "パスワード再設定メールの送信に失敗しました。",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={styles.panel}>
      <form className={styles.form} onSubmit={handleSubmit}>
        <label className={styles.label} htmlFor="reset-email">
          メールアドレス
        </label>
        <input
          className={styles.input}
          id="reset-email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />

        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        {message && (
          <p className={styles.message} role="status">
            {message}
          </p>
        )}

        <button
          className={styles.submitButton}
          type="submit"
          disabled={isSubmitting}
        >
          {isSubmitting ? "送信中..." : "再設定メールを送信"}
        </button>
      </form>

      <p className={styles.navigation}>
        <Link href="/login" className={styles.navigationLink}>
          ログイン画面に戻る
        </Link>
      </p>
    </div>
  );
}
