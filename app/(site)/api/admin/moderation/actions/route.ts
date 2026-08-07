import { authorizeAdminRequest } from "@/lib/adminAuth";
import type { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { PRIVATE_NO_STORE_HEADERS } from "@/lib/httpCache";
import { readJsonBody } from "@/lib/requestJson";
import { hasJsonContentType } from "@/lib/requestContentType";
import {
  consumeAdminActionIpRateLimit,
  consumeAdminActionRateLimit,
} from "@/lib/adminActionRateLimit";
import { getClientIp } from "@/lib/clientIp";
import { getModerationNotification } from "@/lib/moderationNotification";
import { decideViolationSuspension } from "@/lib/moderationViolation";
import {
  createModeratedUrlHash,
  getModerationDeadline,
  isModerationReasonCode,
  resolveModerationReviewMode,
  type ModerationReasonCode,
} from "@/lib/moderationRemediation";

const MAX_MODERATION_ACTION_BODY_BYTES = 16 * 1024;

type TargetType = "profile" | "audio" | "socialLink";
type ActionType = "hide" | "restore" | "suspend";

type ActionRequest = {
  targetType?: unknown;
  targetId?: unknown;
  action?: unknown;
  reason?: unknown;
  reasonCode?: unknown;
};

const targetTypes: TargetType[] = ["profile", "audio", "socialLink"];
const actionTypes: ActionType[] = ["hide", "restore", "suspend"];

const isTargetType = (value: unknown): value is TargetType =>
  typeof value === "string" && targetTypes.includes(value as TargetType);

const isActionType = (value: unknown): value is ActionType =>
  typeof value === "string" && actionTypes.includes(value as ActionType);

function getNextStatus(targetType: TargetType, action: ActionType) {
  if (action === "restore") return "active";
  if (action === "hide") return "hidden";
  if (action === "suspend" && targetType === "profile") return "suspended";
  return null;
}

export async function PATCH(request: Request) {
  try {
    const authorization = await authorizeAdminRequest(request);
    if (!authorization.ok) return authorization.response;

    const rateLimit = consumeAdminActionRateLimit(authorization.admin.id);
    if (!rateLimit.allowed) {
      return Response.json(
        {
          error:
            "管理操作の回数が上限に達しました。しばらく待ってから再度お試しください。",
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(rateLimit.retryAfterSeconds),
            "X-RateLimit-Limit": String(rateLimit.limit),
            "X-RateLimit-Remaining": String(rateLimit.remaining),
            "X-RateLimit-Reset": String(Math.ceil(rateLimit.resetAt / 1000)),
          },
        },
      );
    }

    const clientIp = getClientIp(request.headers);
    if (clientIp) {
      const ipRateLimit = consumeAdminActionIpRateLimit(clientIp);
      if (!ipRateLimit.allowed) {
        return Response.json(
          {
            error:
              "この接続元からの管理操作が集中しています。しばらく待ってから再度お試しください。",
          },
          {
            status: 429,
            headers: {
              "Retry-After": String(ipRateLimit.retryAfterSeconds),
              "X-RateLimit-Limit": String(ipRateLimit.limit),
              "X-RateLimit-Remaining": String(ipRateLimit.remaining),
              "X-RateLimit-Reset": String(
                Math.ceil(ipRateLimit.resetAt / 1000),
              ),
            },
          },
        );
      }
    }

    if (!hasJsonContentType(request)) {
      return Response.json(
        { error: "Content-Typeはapplication/jsonを指定してください。" },
        { status: 415 },
      );
    }

    const jsonBody = await readJsonBody(
      request,
      MAX_MODERATION_ACTION_BODY_BYTES,
    );
    if (!jsonBody.ok) {
      return Response.json(
        {
          error:
            jsonBody.error === "too_large"
              ? "管理操作データは16KB以下にしてください。"
              : "JSONの形式が不正です。",
        },
        { status: jsonBody.error === "too_large" ? 413 : 400 },
      );
    }

    const body =
      typeof jsonBody.value === "object" && jsonBody.value !== null
        ? (jsonBody.value as ActionRequest)
        : {};
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    const reasonCode: ModerationReasonCode =
      typeof body.reasonCode === "string" &&
      isModerationReasonCode(body.reasonCode)
        ? body.reasonCode
        : "other";
    if (
      body.reasonCode !== undefined &&
      (typeof body.reasonCode !== "string" ||
        !isModerationReasonCode(body.reasonCode))
    ) {
      return Response.json(
        { error: "有効な違反分類を指定してください。" },
        { status: 400 },
      );
    }
    if (
      !isTargetType(body.targetType) ||
      typeof body.targetId !== "string" ||
      !body.targetId ||
      !isActionType(body.action) ||
      reason.length < 1 ||
      reason.length > 500
    ) {
      return Response.json(
        { error: "対象、操作、500文字以内の理由を指定してください。" },
        { status: 400 },
      );
    }

    const targetType = body.targetType;
    const targetId = body.targetId;
    const action = body.action;
    const nextStatus = getNextStatus(targetType, action);
    if (!nextStatus) {
      return Response.json({ error: "この操作は実行できません。" }, { status: 400 });
    }

    const result = await prisma.$transaction(async (tx) => {
      let profileId: string;
      let previousStatus: string;
      let reportedContent: Prisma.InputJsonObject = {};
      let reportedContentHash: string | null = null;
      let reportedStorageObjectKey: string | null = null;
      let accountModerationStatus:
        | "active"
        | "suspended"
        | "deletionPending"
        | null = null;
      let profileStatus: string | null = null;

      if (targetType === "profile") {
        const target = await tx.profile.findUnique({
          where: { id: targetId },
          select: {
            id: true,
            status: true,
            accountModerationStatus: true,
            displayName: true,
            bio: true,
            theme: true,
          },
        });
        if (!target) return { error: "対象が見つかりません。", status: 404 } as const;
        profileId = target.id;
        accountModerationStatus = target.accountModerationStatus;
        profileStatus = target.status;
        previousStatus = target.status;
        reportedContent = {
          displayName: target.displayName ?? "",
          bio: target.bio ?? "",
          theme: target.theme ?? "",
          status: target.status,
        };
        if (previousStatus === nextStatus) {
          return { error: "公開状態はすでに変更されています。", status: 409 } as const;
        }
      } else if (targetType === "audio") {
        const target = await tx.profile.findUnique({
          where: { id: targetId },
          select: {
            id: true,
            audioKey: true,
            audioContentHash: true,
            audioUrl: true,
            audioTitle: true,
            audioStatus: true,
            status: true,
            accountModerationStatus: true,
          },
        });
        if (!target) return { error: "対象が見つかりません。", status: 404 } as const;
        profileId = target.id;
        profileStatus = target.status;
        accountModerationStatus = target.accountModerationStatus;
        previousStatus = target.audioStatus;
        reportedContent = {
          audioTitle: target.audioTitle ?? "",
          audioStatus: target.audioStatus,
          hasAudio: Boolean(target.audioKey || target.audioUrl),
        };
        reportedStorageObjectKey = target.audioKey || null;
        reportedContentHash = target.audioContentHash;
        if (previousStatus === nextStatus) {
          return { error: "公開状態はすでに変更されています。", status: 409 } as const;
        }
      } else {
        const target = await tx.socialLink.findUnique({
          where: { id: targetId },
          select: {
            id: true,
            profileId: true,
            service: true,
            label: true,
            url: true,
            status: true,
          },
        });
        if (!target) return { error: "対象が見つかりません。", status: 404 } as const;
        profileId = target.profileId;
        previousStatus = target.status;
        reportedContent = {
          service: target.service,
          label: target.label,
          url: target.url,
          status: target.status,
        };
        reportedContentHash = await createModeratedUrlHash(target.url);
        if (previousStatus === nextStatus) {
          return { error: "公開状態はすでに変更されています。", status: 409 } as const;
        }
      }

      if (action === "restore") {
        const openCase = await tx.moderationCase.findFirst({
          where: {
            profileId,
            targetType,
            targetId,
            status: {
              in: [
                "correctionRequired",
                "postReviewPending",
                "preReviewPending",
              ],
            },
          },
          select: { id: true },
        });
        if (openCase) {
          return {
            error: "未完了の審査ケースがあるため、ケースの審査操作から再公開してください。",
            status: 409,
          } as const;
        }
      }

      let suspensionTriggered = action === "suspend";
      let effectiveAction: ActionType = action;
      let effectiveNextStatus = nextStatus;
      let profileStatusBeforeAutomaticSuspension: string | null = null;
      if (action === "hide") {
        await tx.$executeRawUnsafe(
          "select pg_advisory_xact_lock(hashtextextended($1, 0))",
          profileId,
        );
        const violationEvents = await tx.moderationViolationEvent.findMany({
          where: { profileId },
          select: {
            id: true,
            eventType: true,
            reasonCode: true,
            originalViolationEventId: true,
          },
        });
        const decision = decideViolationSuspension(
          violationEvents,
          reasonCode,
        );
        if (targetType === "socialLink") {
          const profile = await tx.profile.findUnique({
            where: { id: profileId },
            select: { status: true, accountModerationStatus: true },
          });
          if (!profile) {
            return { error: "対象が見つかりません。", status: 404 } as const;
          }
          profileStatus = profile.status;
          accountModerationStatus = profile.accountModerationStatus;
        }
        suspensionTriggered =
          decision.shouldSuspend && accountModerationStatus === "active";

        if (suspensionTriggered && targetType === "profile") {
          effectiveAction = "suspend";
          effectiveNextStatus = "suspended";
        } else if (suspensionTriggered) {
          profileStatusBeforeAutomaticSuspension = profileStatus;
        }
      }

      if (targetType === "profile") {
        const suspensionAppealDueAt =
          effectiveAction === "suspend" ? getModerationDeadline() : null;
        await tx.profile.update({
          where: { id: targetId },
          data: {
            status: effectiveNextStatus as "active" | "hidden" | "suspended",
            ...(effectiveAction === "suspend"
              ? {
                  accountModerationStatus: "suspended" as const,
                  suspensionAppealDueAt,
                }
              : action === "restore" && accountModerationStatus !== "active"
                ? {
                    accountModerationStatus: "active" as const,
                    suspensionAppealDueAt: null,
                  }
                : {}),
          },
        });
      } else if (targetType === "audio") {
        await tx.profile.update({
          where: { id: targetId },
          data: { audioStatus: nextStatus as "active" | "hidden" },
        });
      } else {
        await tx.socialLink.update({
          where: { id: targetId },
          data: { status: nextStatus as "active" | "hidden" },
        });
      }

      let automaticSuspensionActionId: string | null = null;
      if (
        suspensionTriggered &&
        action === "hide" &&
        targetType !== "profile"
      ) {
        const suspensionAppealDueAt = getModerationDeadline();
        await tx.profile.update({
          where: { id: profileId },
          data: {
            status: "suspended",
            accountModerationStatus: "suspended",
            suspensionAppealDueAt,
          },
        });
        const suspensionAction = await tx.moderationAction.create({
          data: {
            adminUserId: authorization.admin.id,
            profileId,
            targetType: "profile",
            targetId: profileId,
            action: "suspend",
            previousStatus: profileStatusBeforeAutomaticSuspension ?? "active",
            newStatus: "suspended",
            reason,
          },
          select: { id: true },
        });
        automaticSuspensionActionId = suspensionAction.id;
      }

      const moderationAction = await tx.moderationAction.create({
        data: {
          adminUserId: authorization.admin.id,
          profileId,
          targetType,
          targetId,
          action: effectiveAction,
          previousStatus,
          newStatus: effectiveNextStatus,
          reason,
        },
        select: { id: true },
      });
      if (action === "hide" || action === "suspend") {
        const reviewMode = resolveModerationReviewMode(reasonCode);
        const deadline = getModerationDeadline();
        const moderationCase = await tx.moderationCase.create({
          data: {
            profileId,
            targetType,
            targetId,
            reasonCode,
            reviewMode,
            status: "correctionRequired",
            userMessage: reason,
            reviewDueAt: deadline,
            retentionExpiresAt: deadline,
          },
          select: { id: true },
        });
        await tx.moderationSnapshot.create({
          data: {
            moderationCaseId: moderationCase.id,
            kind: "reported",
            content: reportedContent,
            contentHash: reportedContentHash,
            storageObjectKey: reportedStorageObjectKey,
            expiresAt: deadline,
          },
        });
        await tx.moderationCaseEvent.create({
          data: {
            moderationCaseId: moderationCase.id,
            eventType: "created",
            actorType: "admin",
            actorId: authorization.admin.id,
            previousStatus: null,
            newStatus: "correctionRequired",
            details: { targetType, targetId, reasonCode },
          },
        });
        await tx.moderationViolationEvent.create({
          data: {
            profileId,
            moderationCaseId: moderationCase.id,
            adminUserId: authorization.admin.id,
            adminAuthId: authorization.admin.authId,
            adminRole: authorization.admin.role,
            eventType: "confirmed",
            reasonCode,
            suspensionTriggered,
            note: reason,
          },
          select: { id: true },
        });
      }
      const notification = getModerationNotification(targetType, effectiveAction);
      await tx.userNotification.create({
        data: {
          profileId,
          moderationActionId: moderationAction.id,
          title: notification.title,
          message: notification.message,
        },
      });

      if (automaticSuspensionActionId) {
        const suspensionNotification = getModerationNotification(
          "profile",
          "suspend",
        );
        await tx.userNotification.create({
          data: {
            profileId,
            moderationActionId: automaticSuspensionActionId,
            title: suspensionNotification.title,
            message: suspensionNotification.message,
          },
        });
      }

      return {
        previousStatus,
        newStatus: effectiveNextStatus,
        accountSuspended: suspensionTriggered,
      } as const;
    });

    if ("error" in result) {
      return Response.json({ error: result.error }, { status: result.status });
    }

    return Response.json(
      { success: true, ...result },
      { headers: PRIVATE_NO_STORE_HEADERS },
    );
  } catch (error) {
    console.error("Failed to update moderation status", error);
    return Response.json(
      { error: "公開状態を変更できませんでした。" },
      { status: 500 },
    );
  }
}
