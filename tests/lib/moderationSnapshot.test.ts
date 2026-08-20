import { describe, expect, it, vi } from "vitest";

import { createModerationSnapshot } from "@/lib/moderationSnapshot";

describe("createModerationSnapshot", () => {
  it("音声証拠の作成時に保持状態を同じtransactionで作成する", async () => {
    const snapshotCreate = vi.fn().mockResolvedValue({ id: "snapshot-audio" });
    const lifecycleCreate = vi.fn().mockResolvedValue({});
    const transaction = {
      moderationSnapshot: { create: snapshotCreate },
      moderationSnapshotEvidenceLifecycle: { create: lifecycleCreate },
    } as never;
    const expiresAt = new Date("2026-09-01T00:00:00.000Z");

    await createModerationSnapshot(transaction, {
      moderationCaseId: "case-1",
      kind: "reported",
      content: { audioTitle: "証拠音声" },
      storageObjectKey: "audio/test/evidence.m4a",
      expiresAt,
    });

    expect(lifecycleCreate).toHaveBeenCalledWith({
      data: { snapshotId: "snapshot-audio", retainUntil: expiresAt },
    });
  });

  it("音声証拠でないスナップショットには保持状態を作成しない", async () => {
    const snapshotCreate = vi.fn().mockResolvedValue({ id: "snapshot-link" });
    const lifecycleCreate = vi.fn();
    const transaction = {
      moderationSnapshot: { create: snapshotCreate },
      moderationSnapshotEvidenceLifecycle: { create: lifecycleCreate },
    } as never;

    await createModerationSnapshot(transaction, {
      moderationCaseId: "case-1",
      kind: "corrected",
      content: { url: "https://example.com" },
      expiresAt: new Date("2026-09-01T00:00:00.000Z"),
    });

    expect(lifecycleCreate).not.toHaveBeenCalled();
  });
});
