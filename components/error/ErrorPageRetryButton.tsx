"use client";

import styles from "./ErrorPage.module.css";

export default function ErrorPageRetryButton({
  onRetry,
  label,
}: {
  onRetry: () => void;
  label: string;
}) {
  return (
    <button className={styles.retryButton} type="button" onClick={onRetry}>
      {label}
    </button>
  );
}
