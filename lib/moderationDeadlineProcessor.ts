import { prisma } from "@/lib/prisma";
import {
  addModerationPeriod,
  decideModerationDeadlineAction,
} from "@/lib/moderationDeadline";

const DEFAULT_BATCH_SIZE = 100;
const MAX_BATCH_SIZE = 500;
const PENDING_ADMIN_REVIEW_STATUSES = [
  "postReviewPending",
  "preReviewPending",
] as const;

export type ModerationDeadlineProcessResult = {
  examined: number;
  suspended: number;
  deletionScheduled: number;
  deletionCandidates: number;
  skipped: number;
  failed: number;
};

export async function processModerationDeadlines(
  now: Date = new Date(),
  requestedBatchSize: number = DEFAULT_BATCH_SIZE,
): Promise<ModerationDeadlineProcessResult> {
  const batchSize = Math.min(
    Math.max(Math.trunc(requestedBatchSize), 1),
    MAX_BATCH_SIZE,
  );
  const profiles = await prisma.profile.findMany({
    where: {
      OR: [
        {
          accountModerationStatus: "active",
          moderationCases: {
            some: { status: "correctionRequired", reviewDueAt: { lte: now } },
          },
        },
        {
          accountModerationStatus: "suspended",
          suspensionAppealDueAt: { lte: now },
        },
        {
          accountModerationStatus: "deletionPending",
          deletionScheduledAt: { lte: now },
        },
      ],
    },
    select: {
      id: true,
      status: true,
      accountModerationStatus: true,
      suspensionAppealDueAt: true,
      deletionScheduledAt: true,
      moderationCases: {
        where: {
          status: {
            in: [
              "correctionRequired",
              "postReviewPending",
              "preReviewPending",
            ],
          },
        },
        select: { id: true, status: true, reviewDueAt: true },
      },
      moderationRequests: {
        where: { kind: "accountAppeal", status: "pending" },
        select: { id: true },
        take: 1,
      },
    },
    orderBy: { id: "asc" },
    take: batchSize,
  });

  const result: ModerationDeadlineProcessResult = {
    examined: profiles.length,
    suspended: 0,
    deletionScheduled: 0,
    deletionCandidates: 0,
    skipped: 0,
    failed: 0,
  };

  for (const profile of profiles) {
    const overdueCases = profile.moderationCases.filter(
      (moderationCase) =>
        moderationCase.status === "correctionRequired" &&
        moderationCase.reviewDueAt.getTime() <= now.getTime(),
    );
    const pendingReviewCases = profile.moderationCases.filter((moderationCase) =>
      PENDING_ADMIN_REVIEW_STATUSES.includes(
        moderationCase.status as (typeof PENDING_ADMIN_REVIEW_STATUSES)[number],
      ),
    );
    const decision = decideModerationDeadlineAction(
      {
        accountStatus: profile.accountModerationStatus,
        suspensionAppealDueAt: profile.suspensionAppealDueAt,
        deletionScheduledAt: profile.deletionScheduledAt,
        overdueUnsubmittedCaseCount: overdueCases.length,
        hasPendingAdminReview: pendingReviewCases.length > 0,
        hasPendingAppeal: profile.moderationRequests.length > 0,
      },
      now,
    );

    if (decision.action === "none") {
      result.skipped += 1;
      continue;
    }
    if (decision.action === "delete") {
      result.deletionCandidates += 1;
      continue;
    }

    try {
      const changed = await prisma.$transaction(async (tx) => {
        if (decision.action === "suspend") {
          const suspensionAppealDueAt = addModerationPeriod(now);
          const update = await tx.profile.updateMany({
            where: {
              id: profile.id,
              accountModerationStatus: "active",
              moderationCases: {
                some: {
                  status: "correctionRequired",
                  reviewDueAt: { lte: now },
                },
              },
            },
            data: {
              status: "suspended",
              accountModerationStatus: "suspended",
              suspensionAppealDueAt,
              deletionScheduledAt: null,
            },
          });
          if (update.count === 0) return false;

          const action = await tx.moderationAction.create({
            data: {
              profileId: profile.id,
              targetType: "profile",
              targetId: profile.id,
              action: "suspend",
              actorType: "system",
              previousStatus: profile.status,
              newStatus: "suspended",
              reason: "修正または申請がないまま60日間が経過したため",
            },
            select: { id: true },
          });
          await tx.userNotification.create({
            data: {
              profileId: profile.id,
              moderationActionId: action.id,
              title: "プロフィールの利用停止について",
              message:
                "修正または申請がないまま60日間が経過したため、プロフィールを利用停止にしました。解除申請は60日以内に行ってください。",
            },
          });
          if (overdueCases.length > 0) {
            await tx.moderationCaseEvent.createMany({
              data: overdueCases.map((moderationCase) => ({
                moderationCaseId: moderationCase.id,
                eventType: "accountSuspended" as const,
                actorType: "system" as const,
                previousStatus: moderationCase.status,
                newStatus: moderationCase.status,
                details: { reason: "correctionDeadlineExpired" },
              })),
            });
          }
          return true;
        }

        const update = await tx.profile.updateMany({
          where: {
            id: profile.id,
            accountModerationStatus: "suspended",
            suspensionAppealDueAt: { lte: now },
            moderationCases: {
              none: { status: { in: [...PENDING_ADMIN_REVIEW_STATUSES] } },
            },
            moderationRequests: {
              none: { kind: "accountAppeal", status: "pending" },
            },
          },
          data: {
            accountModerationStatus: "deletionPending",
            deletionScheduledAt: decision.deletionScheduledAt,
          },
        });
        if (update.count === 0) return false;

        const action = await tx.moderationAction.create({
          data: {
            profileId: profile.id,
            targetType: "profile",
            targetId: profile.id,
            action: "scheduleDeletion",
            actorType: "system",
            previousStatus: "suspended",
            newStatus: "deletionPending",
            reason: "利用停止後60日間、解除申請がなかったため",
          },
          select: { id: true },
        });
        await tx.userNotification.create({
          data: {
            profileId: profile.id,
            moderationActionId: action.id,
            title: "アカウントの削除予定について",
            message: `利用停止後60日間、解除申請がなかったため、アカウントを削除予定に変更しました。削除予定日は${decision.deletionScheduledAt.toISOString()}です。`,
          },
        });
        if (profile.moderationCases.length > 0) {
          await tx.moderationCaseEvent.createMany({
            data: profile.moderationCases.map((moderationCase) => ({
              moderationCaseId: moderationCase.id,
              eventType: "deletionScheduled" as const,
              actorType: "system" as const,
              previousStatus: moderationCase.status,
              newStatus: moderationCase.status,
              details: {
                deletionScheduledAt: decision.deletionScheduledAt.toISOString(),
              },
            })),
          });
        }
        return true;
      });

      if (!changed) {
        result.skipped += 1;
      } else if (decision.action === "suspend") {
        result.suspended += 1;
      } else {
        result.deletionScheduled += 1;
      }
    } catch (error) {
      result.failed += 1;
      console.error("Failed to process moderation deadline:", {
        profileId: profile.id,
        error,
      });
    }
  }

  return result;
}
