import type { Metadata } from "next";
import PasswordResetRequestForm from "@/components/auth/PasswordResetRequestForm";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "パスワード再設定",
  description: "パスワード再設定メールを送信します。",
};

export default function ForgotPasswordPage() {
  return (
    <main className={styles.main}>
      <section
        className={styles.content}
        aria-labelledby="forgot-password-title"
      >
        <div className={styles.intro}>
          <p className={styles.eyebrow}>Reset your password</p>
          <h1 id="forgot-password-title" className={styles.title}>
            パスワードを
            <br />
            再設定しましょう
          </h1>
          <p className={styles.description}>
            登録したメールアドレスを入力してください。
            <br />
            パスワード再設定用のリンクをお送りします。
          </p>
        </div>

        <PasswordResetRequestForm />
      </section>
    </main>
  );
}
