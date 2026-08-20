"use client";

import Link from "next/link";
import { useState } from "react";
import { getAuthErrorPresentation } from "@/lib/authErrorMessages";
import { supabase } from "@/lib/supabaseClient";
import styles from "./PasswordResetRequestForm.module.css";

const successMessage =
  "入力したメールアドレスが登録されている場合、パスワード再設定メールを送信しました。";

export default function PasswordResetRequestForm() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const applyErrorPresentation = (error: unknown) => {
    const presentation = getAuthErrorPresentation(
      error,
      "passwordResetRequest",
    );

    if (presentation.kind === "success") {
      setMessage(presentation.message);
      return;
    }

    setError(presentation.message);
    console.error(presentation.logContext);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setIsSubmitting(true);

    try {
      if (!supabase) {
        const presentation = getAuthErrorPresentation(
          { code: "client_not_configured" },
          "passwordResetRequest",
        );
        setError(presentation.message);
        console.error(presentation.logContext);
        return;
      }

      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (error) {
        applyErrorPresentation(error);
        return;
      }

      setMessage(successMessage);
    } catch (err) {
      applyErrorPresentation(err);
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
