import { prisma } from "@/lib/prisma";
import {
  createRegistrationBanFingerprints,
  type RegistrationBanSubject,
} from "@/lib/registrationBanFingerprint";

export type RegistrationBanCheckSubject = RegistrationBanSubject & {
  id: string;
};

export async function isRegistrationBanned(
  subject: RegistrationBanCheckSubject,
): Promise<boolean> {
  const fingerprints = createRegistrationBanFingerprints(subject).map(
    ({ fingerprint }) => fingerprint,
  );

  const record = await prisma.accountDeletionRecord.findFirst({
    where: {
      banStatus: "active",
      OR: [
        { formerAuthId: subject.id },
        ...(fingerprints.length > 0
          ? [
              {
                bannedIdentifiers: {
                  some: { fingerprint: { in: fingerprints } },
                },
              },
            ]
          : []),
      ],
    },
    select: { id: true },
  });

  return record !== null;
}
