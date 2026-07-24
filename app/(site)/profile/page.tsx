"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Card from "@/components/card/Card";
import styles from "./page.module.css";
import type { ProfileData } from "@/lib/mock/profileData";
import { supabase } from "@/lib/supabaseClient";
import { OTO_MEISHI_USER_ID_KEY } from "@/lib/storageKeys";

export default function ProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const loadProfile = async () => {
      try {
        if (!supabase) {
          throw new Error("認証クライアントが初期化されていません。");
        }

        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();

        if (sessionError) {
          throw sessionError;
        }

        if (!session) {
          window.localStorage.removeItem(OTO_MEISHI_USER_ID_KEY);
          router.replace("/login");
          return;
        }

        const response = await fetch("/api/profile?mine=true", {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        });

        if (response.status === 404) {
          window.localStorage.removeItem(OTO_MEISHI_USER_ID_KEY);
          router.replace("/useridInput");
          return;
        }

        if (!response.ok) {
          const errorResponse = (await response.json().catch(() => null)) as {
            error?: string;
          } | null;
          throw new Error(
            errorResponse?.error || "プロフィールの取得に失敗しました。",
          );
        }

        const profileResponse = (await response.json()) as ProfileData;

        if (!isMounted) {
          return;
        }

        window.localStorage.setItem(
          OTO_MEISHI_USER_ID_KEY,
          profileResponse.userId,
        );
        setProfile(profileResponse);
      } catch (err) {
        if (isMounted) {
          setError(
            err instanceof Error
              ? err.message
              : "プロフィールの取得に失敗しました。",
          );
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    void loadProfile();

    return () => {
      isMounted = false;
    };
  }, [router]);

  return (
    <section className={styles.main}>
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
