"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  getAuthErrorPresentation,
  type AuthErrorContext,
} from "@/lib/authErrorMessages";
import { supabase } from "@/lib/supabaseClient";
import styles from "./AuthPanel.module.css";

interface AuthPanelProps {
  mode: "signup" | "login";
}

export default function AuthPanel({ mode }: AuthPanelProps) {
  const isSignup = mode === "signup";
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isProviderLoading, setIsProviderLoading] = useState<
    "google" | "facebook" | null
  >(null);

  const handleAuthError = (error: unknown, context: AuthErrorContext) => {
    const presentation = getAuthErrorPresentation(error, context);
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
        handleAuthError(
          { code: "client_not_configured" },
          isSignup ? "signup" : "login",
        );
        return;
      }

      if (isSignup) {
        const { error } = await supabase.auth.signUp({
          email,
          password,
        });

        if (error) {
          throw error;
        }

        setMessage(
          "確認メールを送信しました。メールボックスをご確認ください。",
        );
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) {
          throw error;
        }

        router.replace("/profile");
      }
    } catch (err) {
      handleAuthError(err, isSignup ? "signup" : "login");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSocialSignIn = async (provider: "google" | "facebook") => {
    setError(null);
    setMessage(null);
    setIsProviderLoading(provider);

    if (!supabase) {
      handleAuthError({ code: "client_not_configured" }, "oauth");
      setIsProviderLoading(null);
      return;
    }

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${window.location.origin}/profile`,
          queryParams:
            provider === "google" ? { prompt: "select_account" } : undefined,
        },
      });

      if (error) {
        handleAuthError(error, "oauth");
      }
    } catch (err) {
      handleAuthError(err, "oauth");
    } finally {
      setIsProviderLoading(null);
    }
  };

  return (
    <div
      className={styles.panel}
      aria-label={isSignup ? "signup options" : "login options"}
    >
      {/* Social Provider Buttons */}
      <div className={styles.providerStack}>
        <button
          className={styles.providerButton}
          type="button"
          onClick={() => handleSocialSignIn("google")}
          disabled={isSubmitting || isProviderLoading !== null}
        >
          <span className={styles.googleMark} aria-hidden="true">
            G
          </span>
          {isSignup ? "Googleアカウントで登録" : "Googleアカウントでログイン"}
        </button>
        <button
          className={styles.providerButton}
          type="button"
          onClick={() => handleSocialSignIn("facebook")}
          disabled={isSubmitting || isProviderLoading !== null}
        >
          <span className={styles.facebookMark} aria-hidden="true">
            f
          </span>
          {isSignup
            ? "Facebookアカウントで登録"
            : "Facebookアカウントでログイン"}
        </button>
      </div>

      {/* Separator */}
      <div className={styles.separator}>
        <span>または</span>
      </div>

      {/* Credentials Form */}
      <form className={styles.form} onSubmit={handleSubmit}>
        <label className={styles.label} htmlFor="email">
          メールアドレス
        </label>
        <input
          className={styles.input}
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />

        <div className={styles.labelRow}>
          <label className={styles.label} htmlFor="password">
            パスワード
          </label>
          {!isSignup && (
            <Link href="/forgot-password" className={styles.forgotPassword}>
              パスワードをお忘れですか？
            </Link>
          )}
        </div>
        <input
          className={styles.input}
          id="password"
          name="password"
          type="password"
          autoComplete={isSignup ? "new-password" : "current-password"}
          placeholder={isSignup ? "8文字以上" : "パスワードを入力"}
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />

        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        {message && <p className={styles.message}>{message}</p>}

        <button
          className={styles.submitButton}
          type="submit"
          disabled={isSubmitting}
        >
          {isSubmitting
            ? "処理中..."
            : isSignup
              ? "メールアドレスで登録"
              : "メールアドレスでログイン"}
        </button>
      </form>

      {/* Terms of Service (Signup Only) */}
      {isSignup && (
        <p className={styles.terms}>
          登録することで、<Link href="/terms">利用規約</Link>と
          <Link href="/privacy">プライバシーポリシー</Link>
          に同意したことになります。
        </p>
      )}

      {/* Mode Navigation Link */}
      <p className={styles.navigation}>
        {isSignup ? (
          <>
            すでにアカウントをお持ちですか？
            <Link href="/login" className={styles.navigationLink}>
              ログイン
            </Link>
          </>
        ) : (
          <>
            アカウントをお持ちでないですか？
            <Link href="/signup" className={styles.navigationLink}>
              新規登録
            </Link>
          </>
        )}
      </p>
    </div>
  );
}
