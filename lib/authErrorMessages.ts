/**
 * Contexts in which an authentication error is presented to a user.
 *
 * Keeping this list separate from the Supabase calls makes it difficult for a
 * raw provider error to accidentally become user-facing UI.
 */
export type AuthErrorContext =
  "login" | "signup" | "oauth" | "passwordResetRequest" | "passwordUpdate";

export type AuthErrorPresentation = {
  kind: "error" | "success";
  message: string;
  retryable: boolean;
  shouldLog: boolean;
  logContext: AuthErrorLogContext;
};

export type AuthErrorLogContext = {
  context: AuthErrorContext;
  name?: string;
  code?: string;
  status?: number;
};

type AuthErrorShape = {
  name?: string;
  code?: string;
  status?: number;
};

const LOGIN_CREDENTIAL_MESSAGE =
  "メールアドレスまたはパスワードが正しくありません。";
const TEMPORARY_ERROR_MESSAGE = "時間をおいてから、もう一度お試しください。";
const GENERIC_ERROR_MESSAGE =
  "認証に失敗しました。時間をおいてから、もう一度お試しください。";
const PASSWORD_RESET_SUCCESS_MESSAGE =
  "入力したメールアドレスが登録されている場合、パスワード再設定メールを送信しました。";

function getAuthErrorShape(error: unknown): AuthErrorShape {
  if (typeof error !== "object" || error === null) {
    return {};
  }

  const candidate = error as Record<string, unknown>;
  return {
    name: typeof candidate.name === "string" ? candidate.name : undefined,
    code: typeof candidate.code === "string" ? candidate.code : undefined,
    status:
      typeof candidate.status === "number" && Number.isFinite(candidate.status)
        ? candidate.status
        : undefined,
  };
}

function isRateLimitError(
  code: string | undefined,
  status: number | undefined,
) {
  return (
    status === 429 ||
    code === "over_request_rate_limit" ||
    code === "over_email_send_rate_limit" ||
    code === "over_sms_send_rate_limit" ||
    code?.startsWith("over_") === true
  );
}

function createPresentation(
  context: AuthErrorContext,
  shape: AuthErrorShape,
  message: string,
  options?: {
    kind?: "error" | "success";
    retryable?: boolean;
    shouldLog?: boolean;
  },
): AuthErrorPresentation {
  const shouldLog = options?.shouldLog ?? true;
  const safeName =
    shape.name && /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/.test(shape.name)
      ? shape.name
      : undefined;
  const safeCode =
    shape.code && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$/.test(shape.code)
      ? shape.code
      : undefined;
  const safeStatus =
    typeof shape.status === "number" &&
    Number.isInteger(shape.status) &&
    shape.status >= 100 &&
    shape.status <= 599
      ? shape.status
      : undefined;

  return {
    kind: options?.kind ?? "error",
    message,
    retryable: options?.retryable ?? true,
    shouldLog,
    logContext: {
      context,
      ...(shouldLog && safeName ? { name: safeName } : {}),
      ...(shouldLog && safeCode ? { code: safeCode } : {}),
      ...(shouldLog && safeStatus ? { status: safeStatus } : {}),
    },
  };
}

/**
 * Converts a Supabase AuthError into a safe presentation value.
 *
 * Only `code`, `status`, and `name` are inspected. The provider's `message`
 * and `stack` are deliberately never returned, because they may contain
 * implementation details or user-controlled values.
 */
export function getAuthErrorPresentation(
  error: unknown,
  context: AuthErrorContext,
): AuthErrorPresentation {
  const shape = getAuthErrorShape(error);
  const code = shape.code;
  const status = shape.status;

  if (isRateLimitError(code, status)) {
    return createPresentation(context, shape, TEMPORARY_ERROR_MESSAGE);
  }

  if (context === "passwordResetRequest") {
    if (code === "user_not_found") {
      return createPresentation(
        context,
        shape,
        PASSWORD_RESET_SUCCESS_MESSAGE,
        {
          kind: "success",
          retryable: false,
          shouldLog: false,
        },
      );
    }

    return createPresentation(context, shape, GENERIC_ERROR_MESSAGE);
  }

  if (context === "login") {
    if (
      code === "invalid_credentials" ||
      code === "user_not_found" ||
      code === "email_not_confirmed"
    ) {
      return createPresentation(context, shape, LOGIN_CREDENTIAL_MESSAGE, {
        retryable: false,
        shouldLog: false,
      });
    }

    if (code === "user_banned") {
      return createPresentation(
        context,
        shape,
        "このアカウントは現在利用できません。",
        { retryable: false },
      );
    }
  }

  if (context === "signup") {
    if (code === "weak_password") {
      return createPresentation(
        context,
        shape,
        "パスワードが安全性の条件を満たしていません。別のパスワードをお試しください。",
        { retryable: false },
      );
    }

    if (code === "user_already_exists" || code === "email_exists") {
      return createPresentation(
        context,
        shape,
        "登録を完了できませんでした。入力内容を確認して、もう一度お試しください。",
        { retryable: false, shouldLog: false },
      );
    }
  }

  if (context === "oauth") {
    if (
      code === "bad_oauth_state" ||
      code === "bad_oauth_callback" ||
      code === "oauth_provider_not_supported" ||
      code === "provider_disabled" ||
      code === "provider_email_needs_verification"
    ) {
      return createPresentation(
        context,
        shape,
        "外部サービスでの認証に失敗しました。もう一度お試しください。",
      );
    }
  }

  if (context === "passwordUpdate") {
    if (code === "weak_password") {
      return createPresentation(
        context,
        shape,
        "パスワードが安全性の条件を満たしていません。別のパスワードをお試しください。",
        { retryable: false },
      );
    }

    if (code === "same_password") {
      return createPresentation(
        context,
        shape,
        "現在と異なるパスワードを入力してください。",
        { retryable: false },
      );
    }

    if (
      code === "session_not_found" ||
      code === "session_expired" ||
      code === "reauthentication_needed" ||
      code === "bad_jwt"
    ) {
      return createPresentation(
        context,
        shape,
        "セッションの有効期限が切れました。もう一度ログインしてください。",
        { retryable: false },
      );
    }
  }

  return createPresentation(context, shape, GENERIC_ERROR_MESSAGE);
}
