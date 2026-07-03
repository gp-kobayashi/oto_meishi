import styles from "./Header.module.css";

const Header = () => {
  return (
    <header className={styles.header}>
      <h1 className={styles.title}>oto_meishi</h1>
      <nav className={styles.nav} aria-label="main navigation">
        <a href="/login">ログイン</a>
        <a href="/signup">登録</a>
        <a href="/help">ヘルプ</a>
        <a href="/terms">利用規約</a>
      </nav>
    </header>
  );
};

export default Header;
