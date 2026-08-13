import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { POST } from "@/app/(site)/api/profile/route";
import { prisma } from "@/lib/prisma";
import { createServerSupabaseClient } from "@/lib/supabaseClient";

describe("Supabase Data API profile write access", () => {
  const runId = crypto.randomUUID();
  const email = `direct-write-${runId}@example.com`;
  const password = "password123";
  const profileUserId = `direct-write-${runId}`;
  let authUserId = "";
  let profileId = "";
  let socialLinkId = "";
  let accessToken = "";
  let client: SupabaseClient;
  let serviceClient: SupabaseClient | undefined;

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

    const anonClient = createClient(
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
    client = createClient(
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
        displayName: "Original name",
        bio: "Original bio",
        audioUrl: "https://example.com/audio.mp3",
        audioTitle: "Original audio",
      },
    });
    profileId = profile.id;
    const link = await prisma.socialLink.create({
      data: {
        profileId,
        service: "website",
        url: "https://example.com",
        label: "Site",
      },
    });
    socialLinkId = link.id;
  });

  afterAll(async () => {
    const cleanupErrors: Error[] = [];
    try {
      await prisma.socialLink.deleteMany({ where: { profileId } });
      await prisma.profile.deleteMany({ where: { id: profileId } });
    } catch (error) {
      cleanupErrors.push(error instanceof Error ? error : new Error(String(error)));
    }
    if (authUserId && serviceClient) {
      const { error } = await serviceClient.auth.admin.deleteUser(authUserId);
      if (error) cleanupErrors.push(error);
    }
    await prisma.$disconnect();
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

  it("直接ブラウザMutationを拒否し、行を変更しない", async () => {
    const beforeProfile = await prisma.profile.findUniqueOrThrow({
      where: { id: profileId },
    });
    const beforeLink = await prisma.socialLink.findUniqueOrThrow({
      where: { id: socialLinkId },
    });

    await expectPermissionDenied(
      client.from("Profile").insert({
        userId: `${profileUserId}-inserted`,
        authId: authUserId,
        displayName: "Injected",
        bio: "Injected bio",
        audioUrl: "https://example.com/injected.mp3",
        audioTitle: "Injected audio",
      }),
    );
    await expectPermissionDenied(
      client.from("Profile").update({ displayName: "Injected" }).eq("id", profileId),
    );
    await expectPermissionDenied(client.from("Profile").delete().eq("id", profileId));
    await expectPermissionDenied(
      client.from("SocialLink").insert({
        profileId,
        service: "website",
        url: "https://evil.example",
        label: "Injected",
      }),
    );
    await expectPermissionDenied(
      client.from("SocialLink").update({ label: "Injected" }).eq("id", socialLinkId),
    );
    await expectPermissionDenied(client.from("SocialLink").delete().eq("id", socialLinkId));

    expect(await prisma.profile.findUniqueOrThrow({ where: { id: profileId } })).toEqual(beforeProfile);
    expect(await prisma.socialLink.findUniqueOrThrow({ where: { id: socialLinkId } })).toEqual(beforeLink);
  }, 20_000);

  it("server API経由のプロフィール更新は維持する", async () => {
    const response = await POST(
      new Request("http://localhost/api/profile", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          userId: profileUserId,
          displayName: "Server updated",
        }),
      }),
    );
    expect(response.status).toBe(200);
    expect(
      (await prisma.profile.findUniqueOrThrow({ where: { id: profileId } }))
        .displayName,
    ).toBe("Server updated");
  });
});
