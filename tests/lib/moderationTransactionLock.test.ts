import { describe, expect, it, vi } from "vitest";
import {
  lockModerationCase,
  lockModerationProfile,
} from "@/lib/moderationTransactionLock";

describe("moderation transaction locks", () => {
  it("プロフィールロックはcanonicalなprofile:キーを使う", async () => {
    const executeRaw = vi.fn().mockResolvedValue(1);

    await lockModerationProfile({ $executeRaw: executeRaw } as never, "p-1");

    expect(executeRaw).toHaveBeenCalledWith(
      [
        "select pg_advisory_xact_lock(hashtextextended(",
        ", 0))",
      ],
      "profile:p-1",
    );
  });

  it("ケースロックはケース識別子をprofileロックと分離する", async () => {
    const executeRaw = vi.fn().mockResolvedValue(1);

    await lockModerationCase({ $executeRaw: executeRaw } as never, "c-1");

    expect(executeRaw).toHaveBeenCalledWith(
      [
        "select pg_advisory_xact_lock(hashtextextended(",
        ", 0))",
      ],
      "case:c-1",
    );
  });
});
