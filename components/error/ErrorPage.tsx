import Link from "next/link";
import ErrorPageRetryButton from "./ErrorPageRetryButton";
import styles from "./ErrorPage.module.css";

export type ErrorPageProps = {
  heading: string;
  description: string;
  retry?: () => void;
  retryLabel?: string;
};

/**
 * Shared, deliberately information-free fallback UI for route and error boundaries.
 * The optional retry callback is supplied only by a client error boundary.
 */
export default function ErrorPage({
  heading,
  description,
  retry,
  retryLabel = "もう一度試す",
}: ErrorPageProps) {
  return (
    <main className={styles.page} aria-labelledby="error-page-heading">
      <section
        className={styles.card}
        aria-describedby="error-page-description"
      >
        <p className={styles.brand}>oto_meishi</p>
        <h1 id="error-page-heading">{heading}</h1>
        <p id="error-page-description" className={styles.description}>
          {description}
        </p>
        <div className={styles.actions}>
          <Link className={styles.homeLink} href="/">
            トップページへ戻る
          </Link>
          {retry ? (
            <ErrorPageRetryButton onRetry={retry} label={retryLabel} />
          ) : null}
        </div>
      </section>
    </main>
  );
}
