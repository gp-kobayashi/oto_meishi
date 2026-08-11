import type { Prisma } from "@/lib/generated/prisma/client";
import {
  compareModeratedUrls,
  createModeratedUrlHash,
  getChangedModeratedProfileFields,
  getModerationDeadline,
  type ModeratedProfileContent,
} from "@/lib/moderationRemediation";

type ProfileTransaction = Prisma.TransactionClient;

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
        in: ["correctionRequired", "postReviewPending", "preReviewPending"],
      },
    },
    select: { id: true, status: true, reviewMode: true },
  });
  if (!existingCase && link.status !== "hidden") return null;

  const reviewMode = "preReview" as const;
  const pendingStatus = "preReviewPending" as const;
  const moderationCase = existingCase
    ? await transaction.moderationCase.update({
        where: { id: existingCase.id },
        data: {
          reviewMode,
          status: pendingStatus,
          reviewDueAt: deadline,
          retentionExpiresAt: deadline,
          resolvedAt: null,
        },
        select: { id: true },
      })
    : await transaction.moderationCase.create({
        data: {
          profileId,
          targetType: "socialLink",
          targetId: link.id,
          reasonCode: "unsafeLink",
          reviewMode,
          status: pendingStatus,
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

  await transaction.moderationSnapshot.create({
    data: {
      moderationCaseId: moderationCase.id,
      kind: "corrected",
      content: deleted
        ? { deleted: true }
        : {
            service: requestedLink?.service,
            url: requestedLink?.url,
            label: requestedLink?.label,
          },
      contentHash: correctedContentHash,
      expiresAt: deadline,
    },
  });
  await transaction.moderationCaseEvent.create({
    data: {
      moderationCaseId: moderationCase.id,
      eventType: deleted ? "contentDeleted" : "contentChanged",
      actorType: "user",
      actorId,
      previousStatus: existingCase?.status ?? "correctionRequired",
      newStatus: pendingStatus,
      details: { targetType: "socialLink", targetId: link.id },
    },
  });

  return {
    pendingStatus,
    reviewMode,
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
        in: ["correctionRequired", "postReviewPending", "preReviewPending"],
      },
    },
    select: { id: true, status: true, reviewMode: true },
  });
  if (!existingCase) return null;

  const deadline = getModerationDeadline();
  const reviewMode = "preReview" as const;
  const pendingStatus = "preReviewPending" as const;
  await transaction.moderationCase.update({
    where: { id: existingCase.id },
    data: {
      reviewMode,
      status: pendingStatus,
      reviewDueAt: deadline,
      retentionExpiresAt: deadline,
      resolvedAt: null,
    },
    select: { id: true },
  });
  await transaction.moderationSnapshot.create({
    data: {
      moderationCaseId: existingCase.id,
      kind: "corrected",
      content: correctedContent,
      expiresAt: deadline,
    },
  });
  await transaction.moderationCaseEvent.create({
    data: {
      moderationCaseId: existingCase.id,
      eventType: "contentChanged",
      actorType: "user",
      actorId,
      previousStatus: existingCase.status,
      newStatus: pendingStatus,
      details: { targetType: "profile", targetId: profileId, changedFields },
    },
  });

  return {
    reviewMode,
    pendingStatus,
    profileStatus: "hidden",
  } as const;
}

export {
  hasMatchingModeratedLinkUrl,
  recordModeratedLinkCorrection,
  recordModeratedProfileCorrection,
};
