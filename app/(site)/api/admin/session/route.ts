import { authorizeAdminRequest } from "@/lib/adminAuth";
import { PRIVATE_NO_STORE_HEADERS } from "@/lib/httpCache";

export async function GET(request: Request) {
  try {
    const authorization = await authorizeAdminRequest(request);
    if (!authorization.ok) return authorization.response;

    return Response.json(
      { admin: authorization.admin },
      { headers: PRIVATE_NO_STORE_HEADERS },
    );
  } catch (error) {
    console.error("Failed to verify admin authorization", error);
    return Response.json(
      { error: "管理者権限を確認できませんでした。" },
      { status: 500 },
    );
  }
}
