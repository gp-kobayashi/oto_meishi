import { describe, expect, it, vi } from "vitest";

import { expireIdentityVerificationRequest } from "@/lib/identityVerificationDeadline";

const createTransaction = (
  expiredCount: number,
  pending: { id: string } | null,
) => ({
  identityVerificationRequest: {
    updateMany: vi.fn().mockResolvedValue({ count: expiredCount }),
    findFirst: vi.fn().mockResolvedValue(pending),
  },
  moderationCase: {
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
  },
});

describe("expireIdentityVerificationRequest", () => {
  const now = new Date("2026-09-02T00:00:00.000Z");

  it("期限切れ申請をexpiredにし、pendingがなければケースを修正待ちへ戻す", async () => {
    const tx = createTransaction(1, null);

    await expect(
      expireIdentityVerificationRequest(tx as never, "case-1", now),
    ).resolves.toEqual({ expiredCount: 1, caseReverted: true });
    expect(tx.identityVerificationRequest.updateMany).toHaveBeenCalledWith({
      where: {
        moderationCaseId: "case-1",
        status: "pending",
        postingDeadlineAt: { lte: now },
      },
      data: { status: "expired" },
    });
    expect(tx.moderationCase.updateMany).toHaveBeenCalledWith({
      where: { id: "case-1", status: "preReviewPending" },
      data: { status: "correctionRequired" },
    });
  });

  it("新しいpending申請があればケースを巻き戻さない", async () => {
    const tx = createTransaction(1, { id: "new-request" });

    await expect(
      expireIdentityVerificationRequest(tx as never, "case-1", now),
    ).resolves.toEqual({ expiredCount: 1, caseReverted: false });
    expect(tx.moderationCase.updateMany).not.toHaveBeenCalled();
  });

  it("期限切れ対象がなければ審査済みケースを変更しない", async () => {
    const tx = createTransaction(0, null);

    await expect(
      expireIdentityVerificationRequest(tx as never, "case-1", now),
    ).resolves.toEqual({ expiredCount: 0, caseReverted: false });
    expect(tx.identityVerificationRequest.findFirst).not.toHaveBeenCalled();
    expect(tx.moderationCase.updateMany).not.toHaveBeenCalled();
  });
});
