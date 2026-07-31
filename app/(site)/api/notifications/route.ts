import { getClientIp } from "@/lib/clientIp";
import { PRIVATE_NO_STORE_HEADERS } from "@/lib/httpCache";
import {
  consumeNotificationReadIpRateLimit,
  consumeNotificationReadUserRateLimit,
} from "@/lib/notificationRateLimit";
import { prisma } from "@/lib/prisma";
import { authorizeProfileOwnerRequest } from "@/lib/profileOwnerAuth";
import {
  getModerationNotificationGuidance,
  type NotificationAction,
  type NotificationReviewMode,
  type NotificationTargetType,
} from "@/lib/moderationNotification";

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
          profile: {
            select: {
              displayName: true,
              audioTitle: true,
            },
          },
          moderationAction: {
            select: {
              targetType: true,
              targetId: true,
              action: true,
              reason: true,
              createdAt: true,
            },
          },
        },
      }),
      prisma.userNotification.count({
        where: {
          profileId: authorization.profileId,
          readAt: null,
        },
      }),
    ]);
    const linkTargetIds = notifications
      .filter(
        (notification) =>
          notification.moderationAction.targetType === "socialLink",
      )
      .map((notification) => notification.moderationAction.targetId);
    const targetPairs = notifications.map((notification) => ({
      targetType: notification.moderationAction.targetType,
      targetId: notification.moderationAction.targetId,
    }));
    const [links, moderationCases] = await Promise.all([
      linkTargetIds.length
        ? prisma.socialLink.findMany({
            where: {
              profileId: authorization.profileId,
              id: { in: linkTargetIds },
            },
            select: { id: true, label: true },
          })
        : Promise.resolve([]),
      targetPairs.length
        ? prisma.moderationCase.findMany({
            where: {
              profileId: authorization.profileId,
              OR: targetPairs,
            },
            orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
            select: {
              targetType: true,
              targetId: true,
              reviewMode: true,
            },
          })
        : Promise.resolve([]),
    ]);
    const linkLabels = new Map(links.map((link) => [link.id, link.label]));
    const reviewModes = new Map<string, NotificationReviewMode>();
    for (const moderationCase of moderationCases) {
      const key = `${moderationCase.targetType}:${moderationCase.targetId}`;
      if (!reviewModes.has(key)) {
        reviewModes.set(key, moderationCase.reviewMode);
      }
    }

    return Response.json(
      {
        notifications: notifications.map((notification) => {
          const targetType = notification.moderationAction
            .targetType as NotificationTargetType;
          const action = notification.moderationAction
            .action as NotificationAction;
          const targetId = notification.moderationAction.targetId;
          const targetLabel =
            targetType === "profile"
              ? "プロフィール"
              : targetType === "audio"
                ? notification.profile.audioTitle || "削除済みの音声"
                : linkLabels.get(targetId) || "対象のリンク";
          const guidance = getModerationNotificationGuidance(
            targetType,
            action,
            reviewModes.get(`${targetType}:${targetId}`) ?? null,
          );

          return {
            id: notification.id,
            title: notification.title,
            message: notification.message,
            targetType,
            targetLabel,
            actionLabel: guidance.actionLabel,
            reason: notification.moderationAction.reason,
            guidance: guidance.guidance,
            actionUrl: guidance.actionUrl,
            actionLinkLabel: guidance.actionLinkLabel,
            handledAt: notification.moderationAction.createdAt.toISOString(),
            readAt: notification.readAt?.toISOString() ?? null,
            createdAt: notification.createdAt.toISOString(),
          };
        }),
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
