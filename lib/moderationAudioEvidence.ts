import type { Prisma } from "@/lib/generated/prisma/client";

type AudioEvidenceReferenceClient = Pick<
  Prisma.TransactionClient,
  "profile" | "moderationSnapshotEvidenceLifecycle"
>;

export type AudioObjectReferenceState = {
  referencedByCurrentProfile: boolean;
  referencedByUnexpiredSnapshot: boolean;
  referencedByUnresolvedCase: boolean;
};

export async function getAudioObjectReferenceState(
  client: AudioEvidenceReferenceClient,
  objectKey: string,
  now: Date = new Date(),
): Promise<AudioObjectReferenceState> {
  const normalizedKey = objectKey.trim();
  if (!normalizedKey) {
    return {
      referencedByCurrentProfile: false,
      referencedByUnexpiredSnapshot: false,
      referencedByUnresolvedCase: false,
    };
  }

  const [currentProfile, unexpiredSnapshot, unresolvedCaseSnapshot] =
    await Promise.all([
    client.profile.findFirst({
      where: {
        OR: [
          { audioKey: normalizedKey },
          { audioUrl: { contains: normalizedKey } },
        ],
      },
      select: { id: true },
    }),
    client.moderationSnapshotEvidenceLifecycle.findFirst({
      where: {
        deletedAt: null,
        retainUntil: { gt: now },
        snapshot: { storageObjectKey: normalizedKey },
      },
      select: { snapshotId: true },
    }),
      client.moderationSnapshotEvidenceLifecycle.findFirst({
        where: {
          deletedAt: null,
          snapshot: {
            storageObjectKey: normalizedKey,
            moderationCase: { status: { not: "confirmed" } },
          },
        },
        select: { snapshotId: true },
      }),
    ]);

  return {
    referencedByCurrentProfile: currentProfile !== null,
    referencedByUnexpiredSnapshot: unexpiredSnapshot !== null,
    referencedByUnresolvedCase: unresolvedCaseSnapshot !== null,
  };
}

export function canDeleteAudioObject(
  referenceState: AudioObjectReferenceState,
): boolean {
  return (
    !referenceState.referencedByCurrentProfile &&
    !referenceState.referencedByUnexpiredSnapshot &&
    !referenceState.referencedByUnresolvedCase
  );
}
