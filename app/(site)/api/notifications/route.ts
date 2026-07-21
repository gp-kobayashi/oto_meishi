import { getClientIp } from "@/lib/clientIp";
import { PRIVATE_NO_STORE_HEADERS } from "@/lib/httpCache";
import {
  consumeNotificationReadIpRateLimit,
  consumeNotificationReadUserRateLimit,
} from "@/lib/notificationRateLimit";
import { prisma } from "@/lib/prisma";
import { authorizeProfileOwnerRequest } from "@/lib/profileOwnerAuth";

const NOTIFICATION_LIMIT = 20;

const rateLimitResponse = (
  message: string,
  rateLimit: {
    limit: number;
    remaining: number;
    resetAt: number;
    retryAfterSeconds: number;
  },
) =>
  Response.json(
    { error: message },
    {
      status: 429,
      headers: {
        ...PRIVATE_NO_STORE_HEADERS,
        "Retry-After": String(rateLimit.retryAfterSeconds),
        "X-RateLimit-Limit": String(rateLimit.limit),
        "X-RateLimit-Remaining": String(rateLimit.remaining),
        "X-RateLimit-Reset": String(Math.ceil(rateLimit.resetAt / 1000)),
      },
    },
  );

export async function GET(request: Request) {
  try {
    const authorization = await authorizeProfileOwnerRequest(request);
    if (!authorization.ok) return authorization.response;

    const userRateLimit = consumeNotificationReadUserRateLimit(
      authorization.userId,
    );
    if (!userRateLimit.allowed) {
      return rateLimitResponse(
        "通知の取得回数が上限に達しました。しばらくお待ちください。",
        userRateLimit,
      );
    }

    const clientIp = getClientIp(request.headers);
    if (clientIp) {
      const ipRateLimit = consumeNotificationReadIpRateLimit(clientIp);
      if (!ipRateLimit.allowed) {
        return rateLimitResponse(
          "この接続元からの通知取得が集中しています。しばらくお待ちください。",
          ipRateLimit,
        );
      }
    }

    const [notifications, unreadCount] = await prisma.$transaction([
      prisma.userNotification.findMany({
        where: { profileId: authorization.profileId },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: NOTIFICATION_LIMIT,
        select: {
          id: true,
          title: true,
          message: true,
          readAt: true,
          createdAt: true,
        },
      }),
      prisma.userNotification.count({
        where: {
          profileId: authorization.profileId,
          readAt: null,
        },
      }),
    ]);

    return Response.json(
      {
        notifications: notifications.map((notification) => ({
          ...notification,
          readAt: notification.readAt?.toISOString() ?? null,
          createdAt: notification.createdAt.toISOString(),
        })),
        unreadCount,
      },
      { headers: PRIVATE_NO_STORE_HEADERS },
    );
  } catch (error) {
    console.error("Failed to load notifications", error);
    return Response.json(
      { error: "通知を取得できませんでした。" },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS },
    );
  }
}
