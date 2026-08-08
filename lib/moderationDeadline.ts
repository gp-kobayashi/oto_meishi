import { MODERATION_REVIEW_PERIOD_DAYS } from "@/lib/moderationRemediation";

export type ModerationDeadlineState = {
  accountStatus: "active" | "suspended" | "deletionPending";
  suspensionAppealDueAt: Date | null;
  deletionScheduledAt: Date | null;
  overdueUnsubmittedCaseCount: number;
  hasPendingAdminReview: boolean;
  hasPendingAppeal: boolean;
};

export type ModerationDeadlineDecision =
  | { action: "none" }
  | { action: "suspend" }
  | { action: "scheduleDeletion"; deletionScheduledAt: Date }
  | { action: "delete" };

export function addModerationPeriod(from: Date): Date {
  const deadline = new Date(from);
  deadline.setUTCDate(deadline.getUTCDate() + MODERATION_REVIEW_PERIOD_DAYS);
  return deadline;
}

/**
 * 利用者の未対応期限だけを進める。管理者審査または解除申請の処理待ちは、
 * 利用者側の放置ではないため自動停止・自動削除の対象にしない。
 */
export function decideModerationDeadlineAction(
  state: ModerationDeadlineState,
  now: Date = new Date(),
): ModerationDeadlineDecision {
  if (state.accountStatus === "active") {
    return state.overdueUnsubmittedCaseCount > 0
      ? { action: "suspend" }
      : { action: "none" };
  }

  if (state.hasPendingAdminReview || state.hasPendingAppeal) {
    return { action: "none" };
  }

  if (state.accountStatus === "suspended") {
    if (
      !state.suspensionAppealDueAt ||
      state.suspensionAppealDueAt.getTime() > now.getTime()
    ) {
      return { action: "none" };
    }

    return {
      action: "scheduleDeletion",
      deletionScheduledAt: addModerationPeriod(now),
    };
  }

  if (
    state.deletionScheduledAt &&
    state.deletionScheduledAt.getTime() <= now.getTime()
  ) {
    return { action: "delete" };
  }

  return { action: "none" };
}
