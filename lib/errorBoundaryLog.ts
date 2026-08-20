export type ErrorBoundaryScope = "route" | "global";

const SAFE_DIGEST_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export const getSafeErrorDigest = (value: unknown): string | undefined => {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 128 ||
    !SAFE_DIGEST_PATTERN.test(value)
  ) {
    return undefined;
  }

  return value;
};

export const logErrorBoundary = (error: unknown, scope: ErrorBoundaryScope) => {
  const digest =
    typeof error === "object" && error !== null && "digest" in error
      ? getSafeErrorDigest(error.digest)
      : undefined;

  console.error("oto_meishi error boundary", { scope, digest });
};
