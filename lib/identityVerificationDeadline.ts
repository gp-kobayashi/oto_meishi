import type { Prisma } from "@/lib/generated/prisma/client";

type Transaction = Pick<
  Prisma.TransactionClient,
  "identityVerificationRequest" | "moderationCase"
>;

/**
 * 期限切れの本人確認申請を失効させ、同じケースに新しい申請がない場合だけ
 * 審査待ちケースを再修正待ちへ戻す。呼び出し側でプロフィール・ケースを
 * ロックしたトランザクション内から呼び出すこと。
 */
export async function expireIdentityVerificationRequest(
  tx: Transaction,
  moderationCaseId: string,
  now: Date,
) {
  const expired = await tx.identityVerificationRequest.updateMany({
    where: {
      moderationCaseId,
      status: "pending",
      postingDeadlineAt: { lte: now },
    },
    data: { status: "expired" },
  });

  if (expired.count === 0) {
    return { expiredCount: 0, caseReverted: false };
  }

  const pending = await tx.identityVerificationRequest.findFirst({
    where: { moderationCaseId, status: "pending" },
    select: { id: true },
  });
  if (pending) {
    return { expiredCount: expired.count, caseReverted: false };
  }

  const reverted = await tx.moderationCase.updateMany({
    where: { id: moderationCaseId, status: "preReviewPending" },
    data: { status: "correctionRequired" },
  });
  return {
    expiredCount: expired.count,
    caseReverted: reverted.count > 0,
  };
}
