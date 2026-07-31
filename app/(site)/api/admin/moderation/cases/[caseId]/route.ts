import { authorizeAdminRequest } from "@/lib/adminAuth";
import type { Prisma } from "@/lib/generated/prisma/client";
import {
  consumeAdminActionIpRateLimit,
  consumeAdminActionRateLimit,
} from "@/lib/adminActionRateLimit";
import { getClientIp } from "@/lib/clientIp";
import { PRIVATE_NO_STORE_HEADERS } from "@/lib/httpCache";
import { getModerationDeadline } from "@/lib/moderationRemediation";
import { prisma } from "@/lib/prisma";
import { readJsonBody } from "@/lib/requestJson";
import { hasJsonContentType } from "@/lib/requestContentType";

const MAX_BODY_BYTES = 8 * 1024;
const decisions = ["approve", "continueHidden", "requestChanges"] as const;
type Decision = (typeof decisions)[number];

const isDecision = (value: unknown): value is Decision =>
  typeof value === "string" &&
  decisions.includes(value as Decision);

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ caseId: string }> },
) {
  try {
    const authorization = await authorizeAdminRequest(request);
    if (!authorization.ok) return authorization.response;

    const userRateLimit = consumeAdminActionRateLimit(authorization.admin.id);
    if (!userRateLimit.allowed) {
      return rateLimitResponse(userRateLimit.retryAfterSeconds);
    }
    const clientIp = getClientIp(request.headers);
    if (clientIp) {
      const ipRateLimit = consumeAdminActionIpRateLimit(clientIp);
      if (!ipRateLimit.allowed) {
        return rateLimitResponse(ipRateLimit.retryAfterSeconds);
      }
    }

    if (!hasJsonContentType(request)) {
      return Response.json(
        { error: "Content-Typeはapplication/jsonを指定してください。" },
        { status: 415, headers: PRIVATE_NO_STORE_HEADERS },
      );
    }
    const jsonBody = await readJsonBody(request, MAX_BODY_BYTES);
    if (!jsonBody.ok) {
      return Response.json(
        {
          error:
            jsonBody.error === "too_large"
              ? "審査内容は8KB以下にしてください。"
              : "JSONの形式が不正です。",
        },
        {
          status: jsonBody.error === "too_large" ? 413 : 400,
          headers: PRIVATE_NO_STORE_HEADERS,
        },
      );
    }

    const body =
      typeof jsonBody.value === "object" && jsonBody.value !== null
        ? (jsonBody.value as { decision?: unknown; reason?: unknown })
        : {};
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    if (!isDecision(body.decision) || !reason || reason.length > 500) {
      return Response.json(
        { error: "審査結果と500文字以内のユーザー向け理由を入力してください。" },
        { status: 400, headers: PRIVATE_NO_STORE_HEADERS },
      );
    }
    const decision = body.decision;

    const { caseId } = await params;
    const result = await prisma.$transaction(async (tx) => {
      const moderationCase = await tx.moderationCase.findUnique({
        where: { id: caseId },
        select: {
          id: true,
          profileId: true,
          targetType: true,
          targetId: true,
          status: true,
          reviewMode: true,
          snapshots: {
            where: { kind: "corrected" },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            take: 1,
            select: { content: true },
          },
          profile: {
            select: {
              status: true,
              audioStatus: true,
              accountModerationStatus: true,
            },
          },
        },
      });
      if (!moderationCase) {
        return { error: "審査対象が見つかりません。", httpStatus: 404 } as const;
      }
      if (
        moderationCase.status !== "postReviewPending" &&
        moderationCase.status !== "preReviewPending"
      ) {
        return {
          error: "この対象は現在、審査待ちではありません。",
          httpStatus: 409,
        } as const;
      }

      const now = new Date();
      const correctedContent = moderationCase.snapshots[0]?.content;
      const targetWasDeleted =
        isRecord(correctedContent) && correctedContent.deleted === true;
      let previousTargetStatus = getCurrentTargetStatus(moderationCase);
      let newTargetStatus = previousTargetStatus;
      let action: "hide" | "restore" | "suspend" | "remove";

      if (decision === "approve") {
        action = targetWasDeleted ? "remove" : "restore";
        if (!targetWasDeleted) {
          newTargetStatus = "active";
          await updateTargetStatus(tx, moderationCase, "active");
        }
        await tx.moderationCase.update({
          where: { id: moderationCase.id },
          data: { status: "confirmed", resolvedAt: now },
        });
        await tx.moderationCaseEvent.create({
          data: {
            moderationCaseId: moderationCase.id,
            eventType: "reviewApproved",
            actorType: "admin",
            actorId: authorization.admin.id,
            previousStatus: moderationCase.status,
            newStatus: "confirmed",
            details: { reason, targetWasDeleted },
          },
        });
      } else {
        const shouldSuspend =
          moderationCase.reviewMode === "postReview";
        action = shouldSuspend ? "suspend" : "hide";
        newTargetStatus = shouldSuspend ? "suspended" : "hidden";
        await updateTargetStatus(tx, moderationCase, "hidden");
        if (shouldSuspend) {
          previousTargetStatus = moderationCase.profile.status;
          await tx.profile.update({
            where: { id: moderationCase.profileId },
            data: {
              status: "suspended",
              accountModerationStatus: "suspended",
              suspensionAppealDueAt: getModerationDeadline(),
            },
          });
        }
        await tx.moderationCase.update({
          where: { id: moderationCase.id },
          data: {
            status: "correctionRequired",
            resolvedAt: null,
            userMessage: reason,
          },
        });
        await tx.moderationCaseEvent.create({
          data: {
            moderationCaseId: moderationCase.id,
            eventType: "reviewRejected",
            actorType: "admin",
            actorId: authorization.admin.id,
            previousStatus: moderationCase.status,
            newStatus: "correctionRequired",
            details: { reason, decision, accountSuspended: shouldSuspend },
          },
        });
      }

      const moderationAction = await tx.moderationAction.create({
        data: {
          adminUserId: authorization.admin.id,
          profileId: moderationCase.profileId,
          targetType: moderationCase.targetType,
          targetId: moderationCase.targetId,
          action,
          previousStatus: previousTargetStatus,
          newStatus: newTargetStatus,
          reason,
        },
        select: { id: true },
      });
      await tx.userNotification.create({
        data: {
          profileId: moderationCase.profileId,
          moderationActionId: moderationAction.id,
          title:
            decision === "approve"
              ? "修正内容が確認されました"
              : decision === "requestChanges"
                ? "追加の修正が必要です"
                : "非公開が継続されました",
          message: reason,
        },
      });

      return {
        success: true,
        decision,
        status: decision === "approve" ? "confirmed" : "correctionRequired",
        accountSuspended:
          decision !== "approve" &&
          moderationCase.reviewMode === "postReview",
      } as const;
    });

    if ("error" in result) {
      return Response.json(
        { error: result.error },
        { status: result.httpStatus, headers: PRIVATE_NO_STORE_HEADERS },
      );
    }
    return Response.json(result, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    console.error("Failed to review moderation case", error);
    return Response.json(
      { error: "審査結果を保存できませんでした。" },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS },
    );
  }
}

function rateLimitResponse(retryAfterSeconds: number) {
  return Response.json(
    { error: "管理操作の上限に達しました。しばらくお待ちください。" },
    {
      status: 429,
      headers: {
        ...PRIVATE_NO_STORE_HEADERS,
        "Retry-After": String(retryAfterSeconds),
      },
    },
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getCurrentTargetStatus(moderationCase: {
  targetType: "profile" | "audio" | "socialLink";
  profile: { status: string; audioStatus: string };
}) {
  if (moderationCase.targetType === "profile") {
    return moderationCase.profile.status;
  }
  if (moderationCase.targetType === "audio") {
    return moderationCase.profile.audioStatus;
  }
  return "hidden";
}

async function updateTargetStatus(
  tx: Prisma.TransactionClient,
  moderationCase: {
    profileId: string;
    targetType: "profile" | "audio" | "socialLink";
    targetId: string;
  },
  status: "active" | "hidden",
) {
  if (moderationCase.targetType === "profile") {
    await tx.profile.update({
      where: { id: moderationCase.profileId },
      data: { status },
    });
  } else if (moderationCase.targetType === "audio") {
    await tx.profile.update({
      where: { id: moderationCase.profileId },
      data: { audioStatus: status },
    });
  } else {
    await tx.socialLink.updateMany({
      where: { id: moderationCase.targetId },
      data: { status },
    });
  }
}
