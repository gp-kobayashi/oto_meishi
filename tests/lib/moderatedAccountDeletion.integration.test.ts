import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { deleteModeratedAccount } from "@/lib/moderatedAccountDeletion";
import { prisma } from "@/lib/prisma";
import { isRegistrationBanned } from "@/lib/registrationBan";
import { createServerSupabaseClient } from "@/lib/supabaseClient";

describe("モデレーション対象アカウント完全削除の統合テスト", () => {
  const testRunId = crypto.randomUUID();
  const email = `deleted-${testRunId}@example.com`;
  const deletionAt = new Date("2026-12-06T00:00:00.000Z");
  let authId = "";
  let profileId = "";

  beforeAll(async () => {
    const supabaseAdmin = createServerSupabaseClient();
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      email_confirm: true,
    });
    if (error || !data.user) {
      throw error ?? new Error("Failed to create integration Auth user.");
    }
    authId = data.user.id;

    const profile = await prisma.profile.create({
      data: {
        userId: `delete-${testRunId}`,
        authId,
        displayName: "完全削除確認用",
        bio: "統合テスト用データ",
        theme: "normal",
        audioUrl: "",
        audioTitle: "",
        status: "suspended",
        accountModerationStatus: "deletionPending",
        deletionScheduledAt: deletionAt,
      },
      select: { id: true },
    });
    profileId = profile.id;
  });

  afterAll(async () => {
    if (authId) {
      const supabaseAdmin = createServerSupabaseClient();
      await supabaseAdmin.auth.admin.deleteUser(authId);
      await prisma.accountDeletionRecord.deleteMany({
        where: { formerAuthId: authId },
      });
      await prisma.profile.deleteMany({ where: { authId } });
    }
  });

  it("利用データとAuthを削除し同じメールの再登録を拒否する", async () => {
    await expect(deleteModeratedAccount(profileId, deletionAt)).resolves.toEqual(
      { status: "deleted" },
    );

    await expect(
      prisma.profile.findUnique({ where: { id: profileId } }),
    ).resolves.toBeNull();

    const deletionRecord = await prisma.accountDeletionRecord.findUnique({
      where: { formerAuthId: authId },
      include: { bannedIdentifiers: true },
    });
    expect(deletionRecord).toMatchObject({
      formerAuthId: authId,
      deletedAt: deletionAt,
      banStatus: "active",
    });
    expect(deletionRecord?.bannedIdentifiers).toEqual([
      expect.objectContaining({ identifierType: "email", provider: null }),
    ]);

    const supabaseAdmin = createServerSupabaseClient();
    const { data: deletedAuthUser, error: deletedAuthUserError } =
      await supabaseAdmin.auth.admin.getUserById(authId);
    expect(deletedAuthUser.user).toBeNull();
    expect(deletedAuthUserError?.status).toBe(404);

    await expect(
      isRegistrationBanned({ id: crypto.randomUUID(), email }),
    ).resolves.toBe(true);
  });
});
