import { beforeEach, describe, expect, it, vi } from "vitest";

const { mocks } = vi.hoisted(() => ({
  mocks: {
    accountDeletionRecordFindFirst: vi.fn(),
    createRegistrationBanFingerprints: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    accountDeletionRecord: {
      findFirst: mocks.accountDeletionRecordFindFirst,
    },
  },
}));

vi.mock("@/lib/registrationBanFingerprint", () => ({
  createRegistrationBanFingerprints:
    mocks.createRegistrationBanFingerprints,
}));

import { isRegistrationBanned } from "@/lib/registrationBan";

describe("isRegistrationBanned", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createRegistrationBanFingerprints.mockReturnValue([]);
    mocks.accountDeletionRecordFindFirst.mockResolvedValue(null);
  });

  it("以前のAuth IDが有効な禁止記録に一致すると拒否する", async () => {
    mocks.accountDeletionRecordFindFirst.mockResolvedValue({ id: "record-1" });

    await expect(isRegistrationBanned({ id: "auth-user-1" })).resolves.toBe(
      true,
    );

    expect(mocks.accountDeletionRecordFindFirst).toHaveBeenCalledWith({
      where: {
        banStatus: "active",
        OR: [{ formerAuthId: "auth-user-1" }],
      },
      select: { id: true },
    });
  });

  it("メールまたは外部認証IDの指紋も照合する", async () => {
    mocks.createRegistrationBanFingerprints.mockReturnValue([
      {
        identifierType: "email",
        provider: null,
        fingerprint: "a".repeat(64),
      },
      {
        identifierType: "providerIdentity",
        provider: "facebook",
        fingerprint: "b".repeat(64),
      },
    ]);

    await expect(
      isRegistrationBanned({
        id: "new-auth-user",
        email: "user@example.com",
        identities: [],
      }),
    ).resolves.toBe(false);

    expect(mocks.accountDeletionRecordFindFirst).toHaveBeenCalledWith({
      where: {
        banStatus: "active",
        OR: [
          { formerAuthId: "new-auth-user" },
          {
            bannedIdentifiers: {
              some: {
                fingerprint: {
                  in: ["a".repeat(64), "b".repeat(64)],
                },
              },
            },
          },
        ],
      },
      select: { id: true },
    });
  });
});
