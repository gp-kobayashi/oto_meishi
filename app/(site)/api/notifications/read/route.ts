import { getClientIp } from "@/lib/clientIp";
import { PRIVATE_NO_STORE_HEADERS } from "@/lib/httpCache";
import {
  consumeNotificationUpdateIpRateLimit,
  consumeNotificationUpdateUserRateLimit,
} from "@/lib/notificationRateLimit";
import { prisma } from "@/lib/prisma";
import { authorizeProfileOwnerRequest } from "@/lib/profileOwnerAuth";

const rateLimitResponse = (
  message: string,
  rateLimit: { retryAfterSeconds: number },
) =>
  Response.json(
    { error: message },
    {
      status: 429,
      headers: {
        ...PRIVATE_NO_STORE_HEADERS,
        "Retry-After": String(rateLimit.retryAfterSeconds),
      },
    },
  );

export async function PATCH(request: Request) {
  try {
    const authorization = await authorizeProfileOwnerRequest(request);
    if (!authorization.ok) return authorization.response;

    const userRateLimit = await consumeNotificationUpdateUserRateLimit(
      authorization.userId,
    );
    if (!userRateLimit.allowed) {
      return rateLimitResponse(
        "通知の更新回数が上限に達しました。しばらくお待ちください。",
        userRateLimit,
      );
    }

    const clientIp = getClientIp(request.headers);
    if (clientIp) {
      const ipRateLimit = await consumeNotificationUpdateIpRateLimit(clientIp);
      if (!ipRateLimit.allowed) {
        return rateLimitResponse(
          "この接続元からの通知更新が集中しています。しばらくお待ちください。",
          ipRateLimit,
        );
      }
    }

    const result = await prisma.userNotification.updateMany({
      where: {
        profileId: authorization.profileId,
        readAt: null,
      },
      data: { readAt: new Date() },
    });

    return Response.json(
      { success: true, updatedCount: result.count },
      { headers: PRIVATE_NO_STORE_HEADERS },
    );
  } catch (error) {
    console.error("Failed to mark notifications as read", error);
    return Response.json(
      { error: "通知を既読にできませんでした。" },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS },
    );
  }
}
