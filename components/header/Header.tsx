"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import styles from "./Header.module.css";

const Header = () => {
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    const updateSessionState = async () => {
      if (!supabase) {
        setIsLoggedIn(false);
        return;
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();
      setIsLoggedIn(Boolean(session));
    };

    updateSessionState();

    const { data: authListener } = supabase?.auth.onAuthStateChange(
      (_event, session) => {
        setIsLoggedIn(Boolean(session));
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
          <Link href="/profile">マイページ</Link>
        ) : (
          <>
            <Link href="/login">ログイン</Link>
            <Link href="/signup">登録</Link>
          </>
        )}
        <Link href="/help">ヘルプ</Link>
        <Link href="/terms">利用規約</Link>
      </nav>
    </header>
  );
};

export default Header;
