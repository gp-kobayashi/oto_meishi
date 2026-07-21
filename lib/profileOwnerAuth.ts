import { PRIVATE_NO_STORE_HEADERS } from "@/lib/httpCache";
import { prisma } from "@/lib/prisma";
import { createServerSupabaseClient } from "@/lib/supabaseClient";

type ProfileOwnerAuthorizationResult =
  | { ok: true; userId: string; profileId: string }
  | { ok: false; response: Response };

const errorResponse = (error: string, status: number) =>
  Response.json(
    { error },
    { status, headers: PRIVATE_NO_STORE_HEADERS },
  );

export async function authorizeProfileOwnerRequest(
  request: Request,
): Promise<ProfileOwnerAuthorizationResult> {
  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return {
      ok: false,
      response: errorResponse("認証が必要です。", 401),
    };
  }

  const token = authorization.slice("Bearer ".length).trim();
  if (!token) {
    return {
      ok: false,
      response: errorResponse("認証が必要です。", 401),
    };
  }

  const supabase = createServerSupabaseClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);
  if (error || !user) {
    return {
      ok: false,
      response: errorResponse("認証情報が無効です。", 401),
    };
  }

  const profile = await prisma.profile.findUnique({
    where: { authId: user.id },
    select: { id: true },
  });
  if (!profile) {
    return {
      ok: false,
      response: errorResponse("プロフィールが見つかりません。", 404),
    };
  }

  return { ok: true, userId: user.id, profileId: profile.id };
}
