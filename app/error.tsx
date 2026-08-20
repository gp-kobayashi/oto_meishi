"use client";

import { useEffect } from "react";
import ErrorPage from "@/components/error/ErrorPage";
import { logErrorBoundary } from "@/lib/errorBoundaryLog";

type ErrorBoundaryProps = {
  error: Error & { digest?: string };
  retry: () => void;
};

export default function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  useEffect(() => {
    logErrorBoundary(error, "route");
  }, [error]);

  return (
    <ErrorPage
      heading="問題が発生しました"
      description="一時的な問題が発生しました。時間をおいてから、もう一度お試しください。"
      retry={retry}
    />
  );
}
