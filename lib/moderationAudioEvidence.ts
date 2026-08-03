import type { Prisma } from "@/lib/generated/prisma/client";

type AudioEvidenceReferenceClient = Pick<
  Prisma.TransactionClient,
  "profile" | "moderationSnapshot"
>;

export type AudioObjectReferenceState = {
  referencedByCurrentProfile: boolean;
  referencedByUnexpiredSnapshot: boolean;
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
    };
  }

  const [currentProfile, unexpiredSnapshot] = await Promise.all([
    client.profile.findFirst({
      where: {
        OR: [
          { audioKey: normalizedKey },
          { audioUrl: { contains: normalizedKey } },
        ],
      },
      select: { id: true },
    }),
    client.moderationSnapshot.findFirst({
      where: {
        storageObjectKey: normalizedKey,
        expiresAt: { gt: now },
      },
      select: { id: true },
    }),
  ]);

  return {
    referencedByCurrentProfile: currentProfile !== null,
    referencedByUnexpiredSnapshot: unexpiredSnapshot !== null,
  };
}

export function canDeleteAudioObject(
  referenceState: AudioObjectReferenceState,
): boolean {
  return (
    !referenceState.referencedByCurrentProfile &&
    !referenceState.referencedByUnexpiredSnapshot
  );
}
