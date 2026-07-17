import { authorizeAdminRequest } from "@/lib/adminAuth";

export async function GET(request: Request) {
  try {
    const authorization = await authorizeAdminRequest(request);
    if (!authorization.ok) return authorization.response;

    return Response.json({ admin: authorization.admin });
  } catch (error) {
    console.error("Failed to verify admin authorization", error);
    return Response.json(
      { error: "管理者権限を確認できませんでした。" },
      { status: 500 },
    );
  }
}
