import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { GET } from "@/app/(site)/api/profile/route";
import { prisma } from "@/lib/prisma";
import { createServerSupabaseClient } from "@/lib/supabaseClient";

describe("Supabase Data API プロフィール読み取り権限", () => {
  const runId = crypto.randomUUID();
  const email = `direct-read-${runId}@example.com`;
  const password = "password123";
  const profileUserId = `direct-read-${runId}`;
  let authUserId = "";
  let profileId = "";
  let accessToken = "";
  let serviceClient: SupabaseClient;
  let anonClient: SupabaseClient;
  let authenticatedClient: SupabaseClient;

  beforeAll(async () => {
    serviceClient = createServerSupabaseClient();
    const { data: created, error: createError } =
      await serviceClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
    if (createError || !created.user) {
      throw createError ?? new Error("user creation failed");
    }
    authUserId = created.user.id;

    anonClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const { data: session, error: signInError } =
      await anonClient.auth.signInWithPassword({ email, password });
    if (signInError || !session.session) {
      throw signInError ?? new Error("sign in failed");
    }
    accessToken = session.session.access_token;
    authenticatedClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { headers: { Authorization: `Bearer ${accessToken}` } },
      },
    );

    const profile = await prisma.profile.create({
      data: {
        userId: profileUserId,
        authId: authUserId,
        displayName: "Read access profile",
        bio: "Public bio",
        audioUrl: "https://example.com/audio.mp3",
        audioKey: `private/${runId}.mp3`,
        audioContentHash:
          "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        audioTitle: "Public audio title",
        accountModerationStatus: "active",
        status: "active",
        deletionScheduledAt: new Date("2030-01-01T00:00:00.000Z"),
      },
    });
    profileId = profile.id;
    await prisma.socialLink.create({
      data: {
        profileId,
        service: "website",
        url: "https://example.com",
        label: "Public site",
      },
    });
  });

  afterAll(async () => {
    const cleanupErrors: Error[] = [];
    try {
      if (profileId) {
        await prisma.socialLink.deleteMany({ where: { profileId } });
        await prisma.profile.deleteMany({ where: { id: profileId } });
      }
    } catch (error) {
      cleanupErrors.push(
        error instanceof Error ? error : new Error(String(error)),
      );
    }
    if (authUserId) {
      const { error } = await serviceClient.auth.admin.deleteUser(authUserId);
      if (error) {
        cleanupErrors.push(error);
      }
    }
    if (cleanupErrors.length > 0) {
      throw new AggregateError(cleanupErrors, `Failed to clean up ${runId}.`);
    }
  });

  async function expectPermissionDenied(
    operation: PromiseLike<{ error: { code?: string } | null }>,
  ) {
    const { error } = await operation;
    expect(error).toBeTruthy();
    expect(error?.code).toBe("42501");
  }

  it("匿名・認証済み利用者のProfile・SocialLink直接読み取りを拒否する", async () => {
    await expectPermissionDenied(
      anonClient.from("Profile").select("*").eq("id", profileId).maybeSingle(),
    );
    await expectPermissionDenied(
      anonClient.from("SocialLink").select("*").eq("profileId", profileId),
    );
    await expectPermissionDenied(
      authenticatedClient
        .from("Profile")
        .select("*")
        .eq("id", profileId)
        .maybeSingle(),
    );
    await expectPermissionDenied(
      authenticatedClient
        .from("SocialLink")
        .select("*")
        .eq("profileId", profileId),
    );

    const serviceProfile = await serviceClient
      .from("Profile")
      .select("*")
      .eq("id", profileId)
      .single();
    expect(serviceProfile.error).toBeNull();
    expect(serviceProfile.data?.authId).toBe(authUserId);
  }, 20_000);

  it("サーバーAPI経由の公開・所有者プロフィール取得を維持する", async () => {
    const publicResponse = await GET(
      new Request(`http://localhost/api/profile?userId=${profileUserId}`),
    );
    expect(publicResponse.status).toBe(200);
    const publicBody = await publicResponse.json();
    for (const field of [
      "authId",
      "audioKey",
      "audioContentHash",
      "accountModerationStatus",
      "deletionScheduledAt",
      "deletionProcessingStartedAt",
    ]) {
      expect(publicBody).not.toHaveProperty(field);
    }
    expect(publicBody.sns).toEqual([
      { service: "website", url: "https://example.com", label: "Public site" },
    ]);

    const mineResponse = await GET(
      new Request("http://localhost/api/profile?mine=true", {
        headers: { Authorization: `Bearer ${accessToken}` },
      }),
    );
    expect(mineResponse.status).toBe(200);
    const mineBody = await mineResponse.json();
    expect(mineBody.authId).toBe(authUserId);
    expect(mineBody.audioKey).toBe(`private/${runId}.mp3`);
    expect(mineBody.sns).toHaveLength(1);
  }, 20_000);
});
