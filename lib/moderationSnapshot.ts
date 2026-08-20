import type { Prisma } from "@/lib/generated/prisma/client";

type ModerationSnapshotTransaction = Prisma.TransactionClient;
type ModerationSnapshotData = Prisma.ModerationSnapshotUncheckedCreateInput;

/**
 * モデレーション証拠スナップショットを作成する唯一の入口。
 * 音声証拠だけは、保持状態も同じトランザクション内で初期化する。
 */
export async function createModerationSnapshot(
  transaction: ModerationSnapshotTransaction,
  data: ModerationSnapshotData,
) {
  const snapshot = await transaction.moderationSnapshot.create({ data });

  if (data.storageObjectKey != null) {
    await transaction.moderationSnapshotEvidenceLifecycle.create({
      data: {
        snapshotId: snapshot.id,
        retainUntil: data.expiresAt,
      },
    });
  }

  return snapshot;
}
