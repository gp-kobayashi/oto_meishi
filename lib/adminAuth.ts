import { prisma } from "@/lib/prisma";
import { createServerSupabaseClient } from "@/lib/supabaseClient";
import type { AdminRole } from "@/lib/generated/prisma/enums";

type AuthorizedAdmin = {
  id: string;
  authId: string;
  role: AdminRole;
};

export type AdminAuthorizationResult =
  | { ok: true; admin: AuthorizedAdmin }
  | { ok: false; response: Response };

const unauthorized = () =>
  Response.json({ error: "認証が必要です。" }, { status: 401 });

const forbidden = () =>
  Response.json({ error: "管理者権限がありません。" }, { status: 403 });

export async function authorizeAdminRequest(
  request: Request,
  allowedRoles: readonly AdminRole[] = ["moderator", "admin"],
): Promise<AdminAuthorizationResult> {
  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return { ok: false, response: unauthorized() };
  }

  const token = authorization.slice("Bearer ".length).trim();
  if (!token) {
    return { ok: false, response: unauthorized() };
  }

  const supabase = createServerSupabaseClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (error || !user) {
    return { ok: false, response: unauthorized() };
  }

  const admin = await prisma.adminUser.findUnique({
    where: { authId: user.id },
    select: { id: true, authId: true, role: true, isActive: true },
  });

  if (!admin?.isActive || !allowedRoles.includes(admin.role)) {
    return { ok: false, response: forbidden() };
  }

  return {
    ok: true,
    admin: { id: admin.id, authId: admin.authId, role: admin.role },
  };
}
