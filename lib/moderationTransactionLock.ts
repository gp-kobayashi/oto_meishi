import type { Prisma } from "@/lib/generated/prisma/client";

type Transaction = Prisma.TransactionClient;

/**
 * Acquires the profile-scoped lock used by every content mutation and review.
 * pg_advisory_xact_lock is released automatically when the transaction ends.
 */
export async function lockModerationProfile(
  transaction: Transaction,
  profileId: string,
) {
  const profileLockKey = `profile:${profileId}`;
  await transaction.$executeRaw`select pg_advisory_xact_lock(hashtextextended(${profileLockKey}, 0))`;
}

/** Must be called after lockModerationProfile for the same profile. */
export async function lockModerationCase(
  transaction: Transaction,
  caseId: string,
) {
  const caseLockKey = `case:${caseId}`;
  await transaction.$executeRaw`select pg_advisory_xact_lock(hashtextextended(${caseLockKey}, 0))`;
}
