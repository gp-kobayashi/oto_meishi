import type { Metadata } from "next";
import PasswordResetForm from "@/components/auth/PasswordResetForm";
import styles from "../forgot-password/page.module.css";

export const metadata: Metadata = {
  title: "新しいパスワードを設定",
  description: "アカウントの新しいパスワードを設定します。",
};

export default function ResetPasswordPage() {
  return (
    <main className={styles.main}>
      <section
        className={styles.content}
        aria-labelledby="reset-password-title"
      >
        <div className={styles.intro}>
          <p className={styles.eyebrow}>Choose a new password</p>
          <h1 id="reset-password-title" className={styles.title}>
            新しいパスワードを
            <br />
            設定しましょう
          </h1>
          <p className={styles.description}>
            8文字以上の新しいパスワードを入力してください。
            <br />
            確認のため、同じパスワードをもう一度入力します。
          </p>
        </div>

        <PasswordResetForm />
      </section>
    </main>
  );
}
