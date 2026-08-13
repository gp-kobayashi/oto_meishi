import { prisma } from "@/lib/prisma";
import { deleteFromR2 } from "@/lib/r2Storage";
import {
  canDeleteAudioObject,
  getAudioObjectReferenceState,
} from "@/lib/moderationAudioEvidence";

export type PendingDeletionResult = {
  examined: number;
  deleted: number;
  failed: number;
  skipped: number;
};

function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, 2000);
}

export async function retryPendingR2ObjectDeletions(
  now = new Date(),
  batchSize = 100,
): Promise<PendingDeletionResult> {
  const pending = await prisma.pendingR2ObjectDeletion.findMany({
    take: Math.min(Math.max(Math.trunc(batchSize), 1), 500),
    orderBy: { updatedAt: "asc" },
  });
  const result = {
    examined: pending.length,
    deleted: 0,
    failed: 0,
    skipped: 0,
  };
  for (const item of pending) {
    try {
      const refs = await getAudioObjectReferenceState(
        prisma,
        item.objectKey,
        now,
      );
      if (!canDeleteAudioObject(refs)) {
        result.skipped++;
        continue;
      }
      await deleteFromR2(item.objectKey);
      await prisma.pendingR2ObjectDeletion.deleteMany({
        where: { objectKey: item.objectKey },
      });
      result.deleted++;
    } catch (error) {
      result.failed++;
      try {
        await prisma.pendingR2ObjectDeletion.update({
          where: { objectKey: item.objectKey },
          data: {
            attemptCount: { increment: 1 },
            lastAttemptAt: now,
            lastError: errorMessage(error),
          },
        });
      } catch (updateError) {
        console.error(
          "Failed to record pending R2 deletion attempt:",
          updateError,
        );
      }
    }
  }
  return result;
}

export async function markPendingR2ObjectDeletionFailure(
  objectKey: string,
  error: unknown,
) {
  return prisma.pendingR2ObjectDeletion.update({
    where: { objectKey },
    data: {
      attemptCount: { increment: 1 },
      lastAttemptAt: new Date(),
      lastError: errorMessage(error),
    },
  });
}
