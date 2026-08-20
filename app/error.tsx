"use client";

import { useEffect } from "react";
import ErrorPage from "@/components/error/ErrorPage";

type ErrorBoundaryProps = {
  error: Error & { digest?: string };
  retry: () => void;
};

const getSafeDigest = (value: unknown): string | undefined => {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 128 ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value)
  ) {
    return undefined;
  }

  return value;
};

export default function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  useEffect(() => {
    const digest = getSafeDigest(error.digest);
    console.error("oto_meishi error boundary", {
      scope: "route",
      digest,
    });
  }, [error]);

  return (
    <ErrorPage
      heading="問題が発生しました"
      description="一時的な問題が発生しました。時間をおいてから、もう一度お試しください。"
      retry={retry}
    />
  );
}
