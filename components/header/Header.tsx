"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
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
      <h1 className={styles.title}>oto_meishi</h1>
      <nav className={styles.nav} aria-label="main navigation">
        {isLoggedIn ? (
          <a href="/profile">マイページ</a>
        ) : (
          <>
            <a href="/login">ログイン</a>
            <a href="/signup">登録</a>
          </>
        )}
        <a href="/help">ヘルプ</a>
        <a href="/terms">利用規約</a>
      </nav>
    </header>
  );
};

export default Header;
