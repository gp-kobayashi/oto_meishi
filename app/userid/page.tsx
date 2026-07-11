"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./page.module.css";

export default function UserIdInputPage() {
  const router = useRouter();
  const [userId, setUserId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem("oto_meishi_userId");
    if (saved) {
      setUserId(saved);
    }
  }, []);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = userId.trim();
    if (!trimmed) {
      setError("ユーザーIDを入力してください。");
      return;
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
      setError("ユーザーIDは英数字と-_のみ使用できます。");
      return;
    }

    setError(null);
    setIsSaving(true);

    try {
      const response = await fetch("/api/profile", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ userId: trimmed, displayName: trimmed }),
      });

      const text = await response.text();
      let data: { error?: string } | null = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = null;
      }

      if (!response.ok) {
        setError(data?.error || text || "保存に失敗しました。");
        setIsSaving(false);
        return;
      }

      window.localStorage.setItem("oto_meishi_userId", trimmed);
      router.push("/profile");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "保存中にエラーが発生しました。",
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <main className={styles.main}>
      <div className={styles.card}>
        <h1 className={styles.title}>プロフィールURLを決めましょう</h1>
        <p className={styles.description}>
          あなたの oto_meishi
          ページの公開パスとなるユーザーIDを入力してください。
        </p>
        <form className={styles.form} onSubmit={handleSubmit}>
          <label className={styles.label} htmlFor="userId">
            ユーザーID
          </label>
          <div className={styles.inputGroup}>
            <span className={styles.prefix}>oto_meishi.com/</span>
            <input
              id="userId"
              className={styles.input}
              value={userId}
              onChange={(event) => setUserId(event.target.value)}
              placeholder="your-user-id"
              aria-describedby="userIdHelp"
            />
          </div>
          <p id="userIdHelp" className={styles.hint}>
            英数字、ハイフン、アンダースコアが使えます。
          </p>
          {error && <p className={styles.error}>{error}</p>}
          <button className={styles.submitButton} type="submit">
            保存してマイページへ
          </button>
        </form>
      </div>
    </main>
  );
}
