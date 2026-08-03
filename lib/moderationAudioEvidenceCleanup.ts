import { prisma } from "@/lib/prisma";
import { deleteFromR2 } from "@/lib/r2Storage";
import {
  canDeleteAudioObject,
  getAudioObjectReferenceState,
} from "@/lib/moderationAudioEvidence";

const DEFAULT_BATCH_SIZE = 100;
const MAX_BATCH_SIZE = 500;

export type AudioEvidenceCleanupResult = {
  examined: number;
  deletedObjects: number;
  releasedReferences: number;
  failed: number;
};

export async function cleanupExpiredModerationAudioEvidence(
  now: Date = new Date(),
  requestedBatchSize: number = DEFAULT_BATCH_SIZE,
): Promise<AudioEvidenceCleanupResult> {
  const batchSize = Math.min(
    Math.max(Math.trunc(requestedBatchSize), 1),
    MAX_BATCH_SIZE,
  );
  const snapshots = await prisma.moderationSnapshot.findMany({
    where: {
      storageObjectKey: { not: null },
      expiresAt: { lte: now },
    },
    select: { storageObjectKey: true },
    distinct: ["storageObjectKey"],
    orderBy: { storageObjectKey: "asc" },
    take: batchSize,
  });

  const result: AudioEvidenceCleanupResult = {
    examined: snapshots.length,
    deletedObjects: 0,
    releasedReferences: 0,
    failed: 0,
  };

  for (const snapshot of snapshots) {
    const objectKey = snapshot.storageObjectKey;
    if (!objectKey) continue;

    try {
      const references = await getAudioObjectReferenceState(
        prisma,
        objectKey,
        now,
      );

      if (canDeleteAudioObject(references)) {
        // R2の削除成功後に参照を外す。DB更新失敗時は次回実行で再試行できる。
        await deleteFromR2(objectKey);
        result.deletedObjects += 1;
      }

      const updateResult = await prisma.moderationSnapshot.updateMany({
        where: {
          storageObjectKey: objectKey,
          expiresAt: { lte: now },
        },
        data: { storageObjectKey: null },
      });
      result.releasedReferences += updateResult.count;
    } catch (error) {
      result.failed += 1;
      console.error("Failed to cleanup expired moderation audio evidence:", {
        objectKey,
        error,
      });
    }
  }

  return result;
}
