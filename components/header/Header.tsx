"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import styles from "./Header.module.css";
import NotificationBell from "./NotificationBell";

const Header = () => {
  const [accessToken, setAccessToken] = useState("");
  const isLoggedIn = Boolean(accessToken);

  useEffect(() => {
    const updateSessionState = async () => {
      if (!supabase) {
        setAccessToken("");
        return;
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();
      setAccessToken(session?.access_token ?? "");
    };

    updateSessionState();

    const { data: authListener } = supabase?.auth.onAuthStateChange(
      (_event, session) => {
        setAccessToken(session?.access_token ?? "");
      },
    ) ?? { data: null };

    return () => {
      authListener?.subscription.unsubscribe();
    };
  }, []);

  return (
    <header className={styles.header}>
      <Link className={styles.logoContainer} href="/">
        <Image src="/logo.svg" alt="Logo" width={40} height={32} />
      </Link>
      <nav className={styles.nav} aria-label="main navigation">
        {isLoggedIn ? (
          <>
            <Link href="/profile">マイページ</Link>
            <Link href="/logout">ログアウト</Link>
          </>
        ) : (
          <>
            <Link href="/login">ログイン</Link>
            <Link href="/signup">登録</Link>
          </>
        )}
        <Link href="/help">ヘルプ</Link>
        <Link href="/terms">利用規約</Link>
        {isLoggedIn ? <NotificationBell accessToken={accessToken} /> : null}
      </nav>
    </header>
  );
};

export default Header;
