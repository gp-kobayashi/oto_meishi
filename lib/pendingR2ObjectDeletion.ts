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
export type R2DeletionOutcome = "deleted" | "failed" | "skipped";

function errorMessage(error: unknown) {
  return (error instanceof Error ? error.message : String(error)).slice(
    0,
    2000,
  );
}

function nextRetryAt(now: Date, attemptCount: number) {
  const hours = Math.min(24, Math.pow(2, Math.max(0, attemptCount - 1)));
  return new Date(now.getTime() + hours * 60 * 60 * 1000);
}

async function recordFailure(
  objectKey: string,
  now: Date,
  error: unknown,
  attemptCount?: number,
) {
  const nextAttempt = nextRetryAt(now, (attemptCount ?? 0) + 1);
  try {
    await prisma.pendingR2ObjectDeletion.update({
      where: { objectKey },
      data: {
        attemptCount: { increment: 1 },
        lastAttemptAt: now,
        lastError: errorMessage(error),
        nextAttemptAt: nextAttempt,
      },
    });
  } catch (updateError) {
    console.error("Failed to record pending R2 deletion attempt:", updateError);
  }
}

export async function processPendingR2ObjectDeletion(
  objectKey: string,
  now = new Date(),
): Promise<R2DeletionOutcome> {
  let attemptCount = 0;
  try {
    const item = await prisma.pendingR2ObjectDeletion.findUnique({
      where: { objectKey },
    });
    if (!item) {
      return "skipped";
    }
    attemptCount = item.attemptCount;
    const refs = await getAudioObjectReferenceState(prisma, objectKey, now);
    if (!canDeleteAudioObject(refs)) {
      await prisma.pendingR2ObjectDeletion.update({
        where: { objectKey },
        data: { nextAttemptAt: new Date(now.getTime() + 24 * 60 * 60 * 1000) },
      });
      return "skipped";
    }
    await deleteFromR2(objectKey);
    await prisma.pendingR2ObjectDeletion.deleteMany({ where: { objectKey } });
    return "deleted";
  } catch (error) {
    await recordFailure(objectKey, now, error, attemptCount);
    return "failed";
  }
}

export async function requestR2ObjectDeletion(
  objectKey: string,
  now = new Date(),
): Promise<R2DeletionOutcome> {
  try {
    await prisma.pendingR2ObjectDeletion.upsert({
      where: { objectKey },
      create: {
        objectKey,
        attemptCount: 0,
        lastAttemptAt: null,
        lastError: null,
        nextAttemptAt: now,
      },
      update: {
        attemptCount: 0,
        lastAttemptAt: null,
        lastError: null,
        nextAttemptAt: now,
      },
    });
  } catch (error) {
    console.error("Failed to enqueue pending R2 deletion:", error);
    return "failed";
  }
  return processPendingR2ObjectDeletion(objectKey, now);
}

export async function retryPendingR2ObjectDeletions(
  now = new Date(),
  batchSize = 100,
): Promise<PendingDeletionResult> {
  const pending = await prisma.pendingR2ObjectDeletion.findMany({
    where: { nextAttemptAt: { lte: now } },
    take: Math.min(Math.max(Math.trunc(batchSize), 1), 500),
    orderBy: [{ nextAttemptAt: "asc" }, { updatedAt: "asc" }],
  });
  const result: PendingDeletionResult = {
    examined: pending.length,
    deleted: 0,
    failed: 0,
    skipped: 0,
  };
  for (const item of pending) {
    const outcome = await processPendingR2ObjectDeletion(item.objectKey, now);
    result[outcome]++;
  }
  return result;
}
