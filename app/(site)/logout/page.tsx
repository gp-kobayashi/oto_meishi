import Link from "next/link";
import styles from "./page.module.css";

export default function LogoutPage() {
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
            <button className={styles.logoutButton} type="button">
              ログアウトする
            </button>
            <Link className={styles.cancelLink} href="/profile">
              キャンセル
            </Link>
          </div>
        </div>
      </section>
    </section>
  );
}
