"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { OTO_MEISHI_USER_ID_KEY } from "@/lib/storageKeys";
import styles from "./page.module.css";

export default function LogoutPage() {
  const router = useRouter();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogout = async () => {
    setError(null);
    setIsLoggingOut(true);

    try {
      if (!supabase) {
        throw new Error("ログアウトに必要な設定が見つかりませんでした。");
      }

      const { error: signOutError } = await supabase.auth.signOut({
        scope: "local",
      });

      if (signOutError) {
        throw signOutError;
      }

      window.localStorage.removeItem(OTO_MEISHI_USER_ID_KEY);
      router.replace("/login");
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "ログアウトに失敗しました。もう一度お試しください。",
      );
      setIsLoggingOut(false);
    }
  };

  return (
    <section className={styles.main}>
      <section className={styles.logout} aria-labelledby="logout-title">
        <div className={styles.card}>
          <p className={styles.eyebrow}>Logout</p>
          <h1 id="logout-title" className={styles.title}>
            ログアウトしますか？
          </h1>
          <p className={styles.description}>
            編集機能を使う際は再ログインが必要になります。
          </p>

          <div className={styles.actions}>
            <button
              className={styles.logoutButton}
              type="button"
              onClick={handleLogout}
              disabled={isLoggingOut}
            >
              {isLoggingOut ? "ログアウト中..." : "ログアウトする"}
            </button>
            <Link className={styles.cancelLink} href="/profile">
              キャンセル
            </Link>
          </div>
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
        </div>
      </section>
    </section>
  );
}
