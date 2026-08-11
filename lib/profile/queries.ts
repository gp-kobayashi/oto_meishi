import type { Prisma } from "@/lib/generated/prisma/client";

export const ownerModerationCasesQuery = {
  where: {
    status: {
      in: ["correctionRequired", "postReviewPending", "preReviewPending"],
    },
  },
  select: {
    id: true,
    targetType: true,
    targetId: true,
    reasonCode: true,
    reviewMode: true,
    status: true,
    userMessage: true,
    reviewDueAt: true,
  },
  orderBy: { updatedAt: "desc" },
} satisfies Prisma.ModerationCaseFindManyArgs;
