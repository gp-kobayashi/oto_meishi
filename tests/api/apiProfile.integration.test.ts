import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { POST } from "@/app/(site)/api/profile/route";
import { createClient } from "@supabase/supabase-js";
import { prisma } from "@/lib/prisma";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

describe("API Profile 認証統合テスト", () => {
  let token1: string;
  let user1Id: string;
  let token2: string;
  const testUserId1 = `user1-${Date.now()}`;
  const testUserId2 = `user2-${Date.now()}`;

  beforeAll(async () => {
    const email1 = `test1-${Date.now()}@example.com`;
    const password = "password123";

    // テストユーザー1の作成とログイン
    const signUpRes1 = await supabase.auth.signUp({ email: email1, password });
    if (signUpRes1.error) throw signUpRes1.error;
    token1 = signUpRes1.data.session?.access_token || "";
    user1Id = signUpRes1.data.user?.id || "";

    // テストユーザー2の作成とログイン
    const email2 = `test2-${Date.now()}@example.com`;
    const signUpRes2 = await supabase.auth.signUp({ email: email2, password });
    if (signUpRes2.error) throw signUpRes2.error;
    token2 = signUpRes2.data.session?.access_token || "";
  });

  afterAll(async () => {
    // DB内のテストデータの削除
    await prisma.socialLink.deleteMany({
      where: {
        profile: {
          userId: { in: [testUserId1, testUserId2] },
        },
      },
    });
    await prisma.profile.deleteMany({
      where: {
        userId: { in: [testUserId1, testUserId2] },
      },
    });
  });

  it("トークン無しの場合は401を返すこと", async () => {
    const req = new Request("http://localhost/api/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: testUserId1, displayName: "No Token" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toContain("Unauthorized");
  });

  it("正常なトークンがある場合は新規プロフィールを保存できること", async () => {
    const req = new Request("http://localhost/api/profile", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token1}`,
      },
      body: JSON.stringify({ userId: testUserId1, displayName: "User One" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.userId).toBe(testUserId1);
    expect(data.displayName).toBe("User One");
    expect(data.authId).toBe(user1Id);
  });

  it("他人のプロフィールを上書きしようとした場合は403を返すこと", async () => {
    // ユーザー2のトークンを使い、ユーザー1のプロフィール（testUserId1）を変更しようとする
    const req = new Request("http://localhost/api/profile", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token2}`,
      },
      body: JSON.stringify({ userId: testUserId1, displayName: "Hacker" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toContain("変更する権限がありません");
  });
});
