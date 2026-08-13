import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { prisma } from "@/lib/prisma";
import { createServerSupabaseClient } from "@/lib/supabaseClient";

describe("レート制限テーブルのData API権限", () => {
  const scope = `direct-rate-limit-${crypto.randomUUID()}`;
  const keyHash = "a".repeat(64);
  const email = `${scope}@example.com`;
  const password = "password123";
  const serviceClient = createServerSupabaseClient();
  let authUserId = "";
  const anonClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  let authenticatedClient: SupabaseClient;

  beforeAll(async () => {
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
    const { data, error } = await anonClient.auth.signInWithPassword({
      email,
      password,
    });
    if (error || !data.session) {
      throw error ?? new Error("sign in failed");
    }
    authenticatedClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        auth: { persistSession: false, autoRefreshToken: false },
        global: {
          headers: { Authorization: `Bearer ${data.session.access_token}` },
        },
      },
    );
  });

  afterAll(async () => {
    await prisma.rateLimitCounter.deleteMany({ where: { scope } });
    if (authUserId) {
      const { error } = await serviceClient.auth.admin.deleteUser(authUserId);
      if (error) {
        throw error;
      }
    }
    await prisma.$disconnect();
  });

  async function expectPermissionDenied(
    operation: PromiseLike<{ error: { code?: string } | null }>,
  ) {
    const { error } = await operation;
    expect(error?.code).toBe("42501");
  }

  it("anonによる参照と変更を拒否し、サーバー経由の操作だけを許可する", async () => {
    await prisma.rateLimitCounter.create({
      data: {
        scope,
        keyHash,
        count: 1,
        resetAt: new Date(Date.now() + 60_000),
      },
    });

    for (const client of [anonClient, authenticatedClient]) {
      await expectPermissionDenied(
        client.from("RateLimitCounter").select("*").eq("scope", scope),
      );
      await expectPermissionDenied(
        client.from("RateLimitCounter").insert({
          scope: `${scope}-inserted`,
          key_hash: "b".repeat(64),
          count: 1,
          reset_at: new Date(Date.now() + 60_000).toISOString(),
        }),
      );
      await expectPermissionDenied(
        client
          .from("RateLimitCounter")
          .update({ count: 99 })
          .eq("scope", scope),
      );
      await expectPermissionDenied(
        client.from("RateLimitCounter").delete().eq("scope", scope),
      );
    }
    expect(
      await prisma.rateLimitCounter.findUnique({
        where: { scope_keyHash: { scope, keyHash } },
      }),
    ).toMatchObject({ scope, keyHash, count: 1 });
  });
});
