import type {
  ModerationCaseStatus,
  Prisma,
} from "@/lib/generated/prisma/client";
import {
  compareModeratedUrls,
  createModeratedUrlHash,
  getChangedModeratedProfileFields,
  getModerationDeadline,
  type ModeratedProfileContent,
} from "@/lib/moderationRemediation";

type ProfileTransaction = Prisma.TransactionClient;

const MODERATION_CASE_PENDING_STATUSES = [
  "correctionRequired",
  "postReviewPending",
  "preReviewPending",
] satisfies ModerationCaseStatus[];
const PRE_REVIEW_MODE = "preReview" as const;
const PRE_REVIEW_PENDING_STATUS = "preReviewPending" as const;

async function transitionExistingCaseToPreReview(
  transaction: ProfileTransaction,
  caseId: string,
  deadline: Date,
) {
  return transaction.moderationCase.update({
    where: { id: caseId },
    data: {
      reviewMode: PRE_REVIEW_MODE,
      status: PRE_REVIEW_PENDING_STATUS,
      reviewDueAt: deadline,
      retentionExpiresAt: deadline,
      resolvedAt: null,
    },
    select: { id: true },
  });
}

async function appendCorrectionAudit({
  transaction,
  caseId,
  correctedContent,
  contentHash,
  expiresAt,
  eventType,
  actorId,
  previousStatus,
  details,
}: {
  transaction: ProfileTransaction;
  caseId: string;
  correctedContent: Prisma.InputJsonValue;
  contentHash?: string | null;
  expiresAt: Date;
  eventType: "contentChanged" | "contentDeleted";
  actorId: string;
  previousStatus: ModerationCaseStatus;
  details: Prisma.InputJsonValue;
}) {
  await transaction.moderationSnapshot.create({
    data: {
      moderationCaseId: caseId,
      kind: "corrected",
      content: correctedContent,
      ...(contentHash !== undefined ? { contentHash } : {}),
      expiresAt,
    },
  });
  await transaction.moderationCaseEvent.create({
    data: {
      moderationCaseId: caseId,
      eventType,
      actorType: "user",
      actorId,
      previousStatus,
      newStatus: PRE_REVIEW_PENDING_STATUS,
      details,
    },
  });
}

type LinkModerationCase = {
  snapshots: {
    content: unknown;
    contentHash: string | null;
  }[];
};

async function hasMatchingModeratedLinkUrl(
  moderationCases: LinkModerationCase[],
  requestedUrl: string,
): Promise<boolean> {
  const requestedHash = await createModeratedUrlHash(requestedUrl);
  if (!requestedHash) return false;

  return moderationCases.some((moderationCase) =>
    moderationCase.snapshots.some((snapshot) => {
      if (snapshot.contentHash === requestedHash) return true;
      if (
        typeof snapshot.content !== "object" ||
        snapshot.content === null ||
        Array.isArray(snapshot.content)
      ) {
        return false;
      }

      const reportedUrl = (snapshot.content as Record<string, unknown>).url;
      return (
        typeof reportedUrl === "string" &&
        compareModeratedUrls(reportedUrl, requestedUrl) === "same"
      );
    }),
  );
}

async function recordModeratedLinkCorrection({
  transaction,
  profileId,
  link,
  requestedLink,
  actorId,
  deleted,
}: {
  transaction: ProfileTransaction;
  profileId: string;
  link: {
    id: string;
    service: string;
    url: string;
    label: string;
    sortOrder: number;
    status: "active" | "hidden";
  };
  requestedLink?: {
    id?: string;
    service: string;
    url: string;
    label: string;
    sortOrder: number;
  };
  actorId: string;
  deleted: boolean;
}) {
  const deadline = getModerationDeadline();
  const correctedContentHash = deleted
    ? null
    : await createModeratedUrlHash(requestedLink?.url ?? "");
  const existingCase = await transaction.moderationCase.findFirst({
    where: {
      targetType: "socialLink",
      targetId: link.id,
      status: {
        in: MODERATION_CASE_PENDING_STATUSES,
      },
    },
    select: { id: true, status: true, reviewMode: true },
  });
  if (!existingCase && link.status !== "hidden") return null;

  const moderationCase = existingCase
    ? await transitionExistingCaseToPreReview(
        transaction,
        existingCase.id,
        deadline,
      )
    : await transaction.moderationCase.create({
        data: {
          profileId,
          targetType: "socialLink",
          targetId: link.id,
          reasonCode: "unsafeLink",
          reviewMode: PRE_REVIEW_MODE,
          status: PRE_REVIEW_PENDING_STATUS,
          userMessage: "非公開リンクが修正されました。",
          reviewDueAt: deadline,
          retentionExpiresAt: deadline,
        },
        select: { id: true },
      });

  const reportedSnapshot = await transaction.moderationSnapshot.findFirst({
    where: { moderationCaseId: moderationCase.id, kind: "reported" },
    select: { id: true },
  });
  if (!reportedSnapshot) {
    await transaction.moderationSnapshot.create({
      data: {
        moderationCaseId: moderationCase.id,
        kind: "reported",
        content: { service: link.service, url: link.url, label: link.label },
        contentHash: await createModeratedUrlHash(link.url),
        expiresAt: deadline,
      },
    });
  }

  await appendCorrectionAudit({
    transaction,
    caseId: moderationCase.id,
    correctedContent: deleted
      ? { deleted: true }
      : {
          service: requestedLink?.service,
          url: requestedLink?.url,
          label: requestedLink?.label,
        },
    contentHash: correctedContentHash,
    expiresAt: deadline,
    eventType: deleted ? "contentDeleted" : "contentChanged",
    actorId,
    previousStatus: existingCase?.status ?? "correctionRequired",
    details: { targetType: "socialLink", targetId: link.id },
  });

  return {
    pendingStatus: PRE_REVIEW_PENDING_STATUS,
    reviewMode: PRE_REVIEW_MODE,
  };
}

async function recordModeratedProfileCorrection({
  transaction,
  profileId,
  reportedContent,
  correctedContent,
  actorId,
}: {
  transaction: ProfileTransaction;
  profileId: string;
  reportedContent: ModeratedProfileContent;
  correctedContent: ModeratedProfileContent;
  actorId: string;
}) {
  const changedFields = getChangedModeratedProfileFields(
    reportedContent,
    correctedContent,
  );
  if (changedFields.length === 0) return null;

  const existingCase = await transaction.moderationCase.findFirst({
    where: {
      profileId,
      targetType: "profile",
      targetId: profileId,
      status: {
        in: MODERATION_CASE_PENDING_STATUSES,
      },
    },
    select: { id: true, status: true, reviewMode: true },
  });
  if (!existingCase) return null;

  const deadline = getModerationDeadline();
  await transitionExistingCaseToPreReview(transaction, existingCase.id, deadline);
  await appendCorrectionAudit({
    transaction,
    caseId: existingCase.id,
    correctedContent,
    expiresAt: deadline,
    eventType: "contentChanged",
    actorId,
    previousStatus: existingCase.status,
    details: { targetType: "profile", targetId: profileId, changedFields },
  });

  return {
    reviewMode: PRE_REVIEW_MODE,
    pendingStatus: PRE_REVIEW_PENDING_STATUS,
    profileStatus: "hidden",
  } as const;
}

export {
  hasMatchingModeratedLinkUrl,
  recordModeratedLinkCorrection,
  recordModeratedProfileCorrection,
};
