import Header from "../../components/header/Header";
import Footer from "../../components/footer/Footer";
import AuthPanel from "../../components/auth/AuthPanel";
import styles from "./page.module.css";

export default function LoginPage() {
  return (
    <main className={styles.main}>
      <Header />
      <section className={styles.login} aria-labelledby="login-title">
        <div className={styles.intro}>
          <p className={styles.eyebrow}>Welcome back</p>
          <h2 id="login-title" className={styles.title}>
            アカウントに
            <br />
            ログインしましょう
          </h2>
          <p className={styles.description}>
            音声つきの名刺ページを作るためのログイン画面です。
            <br />
            メールアドレス、Google、Facebookのいずれかでログインできます。
          </p>
        </div>

        <AuthPanel mode="login" />
      </section>
      <Footer />
    </main>
  );
}
