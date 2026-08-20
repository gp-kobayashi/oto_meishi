"use client";

import { useEffect } from "react";
import ErrorPage from "@/components/error/ErrorPage";
import { logErrorBoundary } from "@/lib/errorBoundaryLog";
import styles from "./global-error.module.css";

type GlobalErrorProps = {
  error: Error & { digest?: string };
  retry: () => void;
};

export default function GlobalError({ error, retry }: GlobalErrorProps) {
  useEffect(() => {
    logErrorBoundary(error, "global");
  }, [error]);

  return (
    <html lang="ja">
      <head>
        <title>問題が発生しました | oto_meishi</title>
      </head>
      <body className={styles.body}>
        <ErrorPage
          heading="問題が発生しました"
          description="一時的な問題が発生しました。時間をおいてから、もう一度お試しください。"
          retry={retry}
        />
      </body>
    </html>
  );
}
