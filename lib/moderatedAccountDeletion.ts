import { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { deleteFromR2 } from "@/lib/r2Storage";
import { createRegistrationBanFingerprints } from "@/lib/registrationBanFingerprint";
import { createServerSupabaseClient } from "@/lib/supabaseClient";

const PENDING_ADMIN_REVIEW_STATUSES = [
  "postReviewPending",
  "preReviewPending",
] as const;
const DELETION_CLAIM_TIMEOUT_MS = 15 * 60 * 1000;

export type ModeratedAccountDeletionResult =
  | { status: "deleted" }
  | { status: "skipped"; reason: "notEligible" | "missingAuthId" };

export type PendingAuthDeletionResult = {
  examined: number;
  completed: number;
  skipped: number;
  failed: number;
};

function isNotFoundAuthError(error: { status?: number; code?: string }): boolean {
  return error.status === 404 || error.code === "user_not_found";
}

function buildDeletionReason(reasonCodes: string[]): string {
  const uniqueReasonCodes = [...new Set(reasonCodes)].sort();
  return uniqueReasonCodes.length > 0
    ? `利用停止後の申請期限を過ぎたため（違反分類: ${uniqueReasonCodes.join(", ")}）`
    : "利用停止後の申請期限を過ぎたため";
}

async function deleteUnreferencedStorageObjects(
  objectKeys: readonly string[],
): Promise<void> {
  for (const objectKey of objectKeys) {
    const [profileReferences, snapshotReferences] = await Promise.all([
      prisma.profile.count({ where: { audioKey: objectKey } }),
      prisma.moderationSnapshot.count({
        where: { storageObjectKey: objectKey },
      }),
    ]);
    if (profileReferences === 0 && snapshotReferences === 0) {
      await deleteFromR2(objectKey);
    }
  }
}

export async function deleteModeratedAccount(
  profileId: string,
  now: Date = new Date(),
): Promise<ModeratedAccountDeletionResult> {
  const staleClaimBefore = new Date(now.getTime() - DELETION_CLAIM_TIMEOUT_MS);
  const claim = await prisma.profile.updateMany({
    where: {
      id: profileId,
      accountModerationStatus: "deletionPending",
      deletionScheduledAt: { lte: now },
      moderationCases: {
        none: { status: { in: [...PENDING_ADMIN_REVIEW_STATUSES] } },
      },
      moderationRequests: {
        none: { kind: "accountAppeal", status: "pending" },
      },
      OR: [
        { deletionProcessingStartedAt: null },
        { deletionProcessingStartedAt: { lte: staleClaimBefore } },
      ],
    },
    data: { deletionProcessingStartedAt: now },
  });
  if (claim.count === 0) {
    return { status: "skipped", reason: "notEligible" };
  }

  const profile = await prisma.profile.findUnique({
    where: { id: profileId },
    select: {
      authId: true,
      audioKey: true,
      moderationCases: {
        select: {
          reasonCode: true,
          snapshots: {
            where: { storageObjectKey: { not: null } },
            select: { storageObjectKey: true },
          },
        },
      },
    },
  });

  if (!profile) return { status: "skipped", reason: "notEligible" };
  if (!profile.authId) return { status: "skipped", reason: "missingAuthId" };

  const objectKeys = new Set<string>();
  if (profile.audioKey) objectKeys.add(profile.audioKey);
  for (const moderationCase of profile.moderationCases) {
    for (const snapshot of moderationCase.snapshots) {
      if (snapshot.storageObjectKey) objectKeys.add(snapshot.storageObjectKey);
    }
  }

  const authId = profile.authId;
  const supabaseAdmin = createServerSupabaseClient();
  const existingDeletionRecord = await prisma.accountDeletionRecord.findUnique({
    where: { formerAuthId: authId },
    select: { id: true, pendingStorageObjectKeys: true },
  });
  for (const objectKey of existingDeletionRecord?.pendingStorageObjectKeys ?? []) {
    objectKeys.add(objectKey);
  }
  const { data: authUserData, error: getUserError } =
    await supabaseAdmin.auth.admin.getUserById(authId);

  if (getUserError && !isNotFoundAuthError(getUserError)) {
    throw new Error("Failed to load Auth user before account deletion.");
  }

  if (!existingDeletionRecord) {
    const authUser = authUserData.user;
    if (!authUser) {
      throw new Error(
        "Auth user is missing before registration ban identifiers were saved.",
      );
    }
    const fingerprints = createRegistrationBanFingerprints(authUser);
    if (fingerprints.length === 0) {
      throw new Error("No registration ban identifiers could be created.");
    }

    await prisma.accountDeletionRecord.create({
      data: {
        formerAuthId: authId,
        reason: buildDeletionReason(
          profile.moderationCases.map((moderationCase) =>
            String(moderationCase.reasonCode),
          ),
        ),
        pendingStorageObjectKeys: [...objectKeys],
        bannedIdentifiers: { create: fingerprints },
      },
    });
  } else {
    await prisma.accountDeletionRecord.update({
      where: { formerAuthId: authId },
      data: { pendingStorageObjectKeys: [...objectKeys] },
    });
  }

  const deleted = await prisma.$transaction(
    async (tx) => {
      const eligibleProfile = await tx.profile.findFirst({
        where: {
          id: profileId,
          accountModerationStatus: "deletionPending",
          deletionScheduledAt: { lte: now },
          deletionProcessingStartedAt: now,
          moderationCases: {
            none: { status: { in: [...PENDING_ADMIN_REVIEW_STATUSES] } },
          },
          moderationRequests: {
            none: { kind: "accountAppeal", status: "pending" },
          },
        },
        select: { id: true },
      });
      if (!eligibleProfile) return false;

      await tx.$executeRaw`select set_config('app.account_deletion', 'enabled', true)`;
      await tx.moderationAction.deleteMany({ where: { profileId } });
      await tx.profile.delete({ where: { id: profileId } });
      return true;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );

  if (!deleted) return { status: "skipped", reason: "notEligible" };

  await deleteUnreferencedStorageObjects([...objectKeys]);

  if (authUserData.user) {
    const { error: deleteUserError } =
      await supabaseAdmin.auth.admin.deleteUser(authId);
    if (deleteUserError && !isNotFoundAuthError(deleteUserError)) {
      throw new Error("Failed to delete Auth user.");
    }
  }
  await prisma.accountDeletionRecord.update({
    where: { formerAuthId: authId },
    data: { deletedAt: now, pendingStorageObjectKeys: [] },
  });

  return { status: "deleted" };
}

export async function completePendingAccountAuthDeletions(
  now: Date = new Date(),
  batchSize: number = 100,
): Promise<PendingAuthDeletionResult> {
  const records = await prisma.accountDeletionRecord.findMany({
    where: { deletedAt: null, banStatus: "active" },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: Math.min(Math.max(Math.trunc(batchSize), 1), 500),
    select: { formerAuthId: true, pendingStorageObjectKeys: true },
  });
  const result: PendingAuthDeletionResult = {
    examined: records.length,
    completed: 0,
    skipped: 0,
    failed: 0,
  };
  const supabaseAdmin = createServerSupabaseClient();

  for (const record of records) {
    try {
      const profileStillExists = await prisma.profile.count({
        where: { authId: record.formerAuthId },
      });
      if (profileStillExists > 0) {
        result.skipped += 1;
        continue;
      }

      await deleteUnreferencedStorageObjects(record.pendingStorageObjectKeys);

      const { data, error: getUserError } =
        await supabaseAdmin.auth.admin.getUserById(record.formerAuthId);
      if (getUserError && !isNotFoundAuthError(getUserError)) {
        throw new Error("Failed to load pending Auth user.");
      }
      if (data.user) {
        const { error: deleteUserError } =
          await supabaseAdmin.auth.admin.deleteUser(record.formerAuthId);
        if (deleteUserError && !isNotFoundAuthError(deleteUserError)) {
          throw new Error("Failed to delete pending Auth user.");
        }
      }

      await prisma.accountDeletionRecord.update({
        where: { formerAuthId: record.formerAuthId },
        data: { deletedAt: now, pendingStorageObjectKeys: [] },
      });
      result.completed += 1;
    } catch (error) {
      result.failed += 1;
      console.error("Failed to complete pending Auth account deletion:", {
        formerAuthId: record.formerAuthId,
        error,
      });
    }
  }

  return result;
}
