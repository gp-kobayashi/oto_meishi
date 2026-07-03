import Header from "../../components/header/Header";
import Footer from "../../components/footer/Footer";
import styles from "./page.module.css";

export default function SignupPage() {
  return (
    <main className={styles.main}>
      <Header />
      <section className={styles.signup} aria-labelledby="signup-title">
        <div className={styles.intro}>
          <p className={styles.eyebrow}>Create your oto_meishi</p>
          <h2 id="signup-title" className={styles.title}>
            まずはアカウントを
            <br />
            作成しましょう
          </h2>
          <p className={styles.description}>
            音声つきの名刺ページを作るための登録画面です。
            <br />
            メールアドレス、Google、Xのいずれかで始められます。
          </p>
        </div>

        <div className={styles.panel} aria-label="signup options">
          <div className={styles.providerStack}>
            <button className={styles.providerButton} type="button">
              <span className={styles.googleMark} aria-hidden="true">
                G
              </span>
              Googleアカウントで登録
            </button>
            <button className={styles.providerButton} type="button">
              <span className={styles.xMark} aria-hidden="true">
                X
              </span>
              Xアカウントで登録
            </button>
          </div>

          <div className={styles.separator}>
            <span>または</span>
          </div>

          <form className={styles.form}>
            <label className={styles.label} htmlFor="email">
              メールアドレス
            </label>
            <input
              className={styles.input}
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
            />

            <label className={styles.label} htmlFor="password">
              パスワード
            </label>
            <input
              className={styles.input}
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              placeholder="8文字以上"
            />

            <button className={styles.submitButton} type="submit">
              メールアドレスで登録
            </button>
          </form>

          <p className={styles.terms}>
            登録することで、<a href="#">利用規約</a>と
            <a href="#">プライバシーポリシー</a>に同意したことになります。
          </p>
        </div>
      </section>
      <Footer />
    </main>
  );
}
