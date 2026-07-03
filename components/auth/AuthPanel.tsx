import Link from "next/link";
import styles from "./AuthPanel.module.css";

interface AuthPanelProps {
  mode: "signup" | "login";
}

export default function AuthPanel({ mode }: AuthPanelProps) {
  const isSignup = mode === "signup";

  return (
    <div className={styles.panel} aria-label={isSignup ? "signup options" : "login options"}>
      {/* Social Provider Buttons */}
      <div className={styles.providerStack}>
        <button className={styles.providerButton} type="button">
          <span className={styles.googleMark} aria-hidden="true">
            G
          </span>
          {isSignup ? "Googleアカウントで登録" : "Googleアカウントでログイン"}
        </button>
        <button className={styles.providerButton} type="button">
          <span className={styles.xMark} aria-hidden="true">
            X
          </span>
          {isSignup ? "Xアカウントで登録" : "Xアカウントでログイン"}
        </button>
      </div>

      {/* Separator */}
      <div className={styles.separator}>
        <span>または</span>
      </div>

      {/* Credentials Form */}
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
          required
        />

        <div className={styles.labelRow}>
          <label className={styles.label} htmlFor="password">
            パスワード
          </label>
          {!isSignup && (
            <Link href="#" className={styles.forgotPassword}>
              パスワードをお忘れですか？
            </Link>
          )}
        </div>
        <input
          className={styles.input}
          id="password"
          name="password"
          type="password"
          autoComplete={isSignup ? "new-password" : "current-password"}
          placeholder={isSignup ? "8文字以上" : "パスワードを入力"}
          required
        />

        <button className={styles.submitButton} type="submit">
          {isSignup ? "メールアドレスで登録" : "メールアドレスでログイン"}
        </button>
      </form>

      {/* Terms of Service (Signup Only) */}
      {isSignup && (
        <p className={styles.terms}>
          登録することで、<Link href="#">利用規約</Link>と
          <Link href="#">プライバシーポリシー</Link>に同意したことになります。
        </p>
      )}

      {/* Mode Navigation Link */}
      <p className={styles.navigation}>
        {isSignup ? (
          <>
            すでにアカウントをお持ちですか？
            <Link href="/login" className={styles.navigationLink}>
              ログイン
            </Link>
          </>
        ) : (
          <>
            アカウントをお持ちでないですか？
            <Link href="/signup" className={styles.navigationLink}>
              新規登録
            </Link>
          </>
        )}
      </p>
    </div>
  );
}
