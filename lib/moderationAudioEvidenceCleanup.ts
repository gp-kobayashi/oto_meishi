import { prisma } from "@/lib/prisma";
import {
  canDeleteAudioObject,
  getAudioObjectReferenceState,
} from "@/lib/moderationAudioEvidence";
import {
  requestR2ObjectDeletion,
  retryPendingR2ObjectDeletions,
} from "@/lib/pendingR2ObjectDeletion";

const DEFAULT_BATCH_SIZE = 100;
const MAX_BATCH_SIZE = 500;

export type AudioEvidenceCleanupResult = {
  examined: number;
  deletedObjects: number;
  releasedReferences: number;
  failed: number;
  pending: {
    examined: number;
    deleted: number;
    failed: number;
    skipped: number;
  };
};

export async function cleanupExpiredModerationAudioEvidence(
  now: Date = new Date(),
  requestedBatchSize: number = DEFAULT_BATCH_SIZE,
): Promise<AudioEvidenceCleanupResult> {
  const batchSize = Math.min(
    Math.max(Math.trunc(requestedBatchSize), 1),
    MAX_BATCH_SIZE,
  );
  const lifecycleRows = await prisma.moderationSnapshotEvidenceLifecycle.findMany({
    where: {
      deletedAt: null,
      retainUntil: { lte: now },
      snapshot: {
        storageObjectKey: { not: null },
        moderationCase: { status: "confirmed" },
      },
    },
    select: { snapshot: { select: { storageObjectKey: true } } },
    orderBy: { retainUntil: "asc" },
    take: batchSize,
  });
  const objectKeys = [
    ...new Set(
      lifecycleRows
        .map((row) => row.snapshot.storageObjectKey)
        .filter((key): key is string => Boolean(key)),
    ),
  ];

  const result: AudioEvidenceCleanupResult = {
    examined: objectKeys.length,
    deletedObjects: 0,
    releasedReferences: 0,
    failed: 0,
    pending: { examined: 0, deleted: 0, failed: 0, skipped: 0 },
  };

  for (const objectKey of objectKeys) {
    try {
      const references = await getAudioObjectReferenceState(
        prisma,
        objectKey,
        now,
      );

      if (canDeleteAudioObject(references)) {
        const deletionOutcome = await requestR2ObjectDeletion(objectKey, now);
        if (deletionOutcome === "deleted") {
          result.deletedObjects += 1;
          const updateResult =
            await prisma.moderationSnapshotEvidenceLifecycle.updateMany({
              where: {
                deletedAt: null,
                retainUntil: { lte: now },
                snapshot: {
                  storageObjectKey: objectKey,
                  moderationCase: { status: "confirmed" },
                },
              },
              data: { deletedAt: now },
            });
          result.releasedReferences += updateResult.count;
        } else if (deletionOutcome === "failed") {
          result.failed += 1;
        }
      }
    } catch (error) {
      result.failed += 1;
      console.error("Failed to cleanup expired moderation audio evidence:", {
        objectKey,
        error,
      });
    }
  }

  result.pending = await retryPendingR2ObjectDeletions(now, batchSize);
  result.deletedObjects += result.pending.deleted;
  result.failed += result.pending.failed;
  return result;
}
