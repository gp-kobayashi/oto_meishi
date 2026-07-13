import AuthPanel from "@/components/auth/AuthPanel";
import styles from "./page.module.css";

export default function SignupPage() {
  return (
    <section className={styles.main}>
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
            メールアドレス、Google、Facebookのいずれかで始められます。
          </p>
        </div>

        <AuthPanel mode="signup" />
      </section>
    </section>
  );
}
