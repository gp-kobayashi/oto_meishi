"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import Card from "../../components/card/Card";
import UserIdRedirect from "../../components/auth/UserIdRedirect";
import styles from "./page.module.css";
import type { ProfileData } from "../../lib/mock/profileData";

export default function ProfilePage() {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const savedUserId = window.localStorage.getItem("oto_meishi_userId");
    if (!savedUserId) {
      setLoading(false);
      return;
    }

    fetch(`/api/profile?userId=${encodeURIComponent(savedUserId)}`)
      .then(async (res) => {
        if (!res.ok) {
          const payload = await res.json();
          throw new Error(
            payload.error || "プロフィールの取得に失敗しました。",
          );
        }
        return res.json();
      })
      .then((data) => {
        setProfile(data as ProfileData);
      })
      .catch((err) => {
        setError(
          err instanceof Error
            ? err.message
            : "プロフィールの取得に失敗しました。",
        );
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <section className={styles.main}>
      <UserIdRedirect />
      <section className={styles.profile} aria-labelledby="profile-title">
        <div className={styles.backgroundAura}>
          <div className={`${styles.blob} ${styles.back}`} />
          <div className={`${styles.blob} ${styles.middle}`} />
          <div className={`${styles.blob} ${styles.front}`} />
        </div>

        {loading ? (
          <p className={styles.loading}>読み込み中...</p>
        ) : error ? (
          <p className={styles.error}>{error}</p>
        ) : profile ? (
          <div className={styles.cardWrapper}>
            <Link href="/profile/edit" className={styles.editButton}>
              カードを編集する
            </Link>
            <Card link={profile} />
          </div>
        ) : (
          <p className={styles.error}>ユーザーIDが設定されていません。</p>
        )}
      </section>
    </section>
  );
}
