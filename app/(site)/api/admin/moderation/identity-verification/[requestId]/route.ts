import {
  consumeAdminActionIpRateLimit,
  consumeAdminActionRateLimit,
} from "@/lib/adminActionRateLimit";
import { authorizeAdminRequest } from "@/lib/adminAuth";
import { getClientIp } from "@/lib/clientIp";
import { PRIVATE_NO_STORE_HEADERS } from "@/lib/httpCache";
import { prisma } from "@/lib/prisma";
import { hasJsonContentType } from "@/lib/requestContentType";
import { readJsonBody } from "@/lib/requestJson";
import {
  decideActiveViolationSuspension,
  type ViolationHistoryEvent,
} from "@/lib/moderationViolation";

const MAX_REVIEW_BODY_BYTES = 4 * 1024;
const openCaseStatuses = [
  "correctionRequired",
  "postReviewPending",
  "preReviewPending",
] as const;

type SuspensionCorrectionResult = {
  corrected: boolean;
  reason:
    | "corrected"
    | "matchingViolationMissing"
    | "matchingViolationNotSuspensionTrigger"
    | "otherActiveViolations"
    | "deletionPending"
    | "alreadyActive";
};

const noSuspensionCorrection = (
  reason: SuspensionCorrectionResult["reason"],
): SuspensionCorrectionResult => ({ corrected: false, reason });

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ requestId: string }> },
) {
  try {
    const authorization = await authorizeAdminRequest(request);
    if (!authorization.ok) return authorization.response;

    const rateLimit = await consumeAdminActionRateLimit(authorization.admin.id);
    if (!rateLimit.allowed) {
      return rateLimitResponse(rateLimit.retryAfterSeconds);
    }
    const clientIp = getClientIp(request.headers);
    if (clientIp) {
      const ipRateLimit = await consumeAdminActionIpRateLimit(clientIp);
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
    const jsonBody = await readJsonBody(request, MAX_REVIEW_BODY_BYTES);
    if (!jsonBody.ok) {
      return Response.json(
        { error: "JSONの形式が不正です。" },
        { status: 400, headers: PRIVATE_NO_STORE_HEADERS },
      );
    }
    const body =
      typeof jsonBody.value === "object" && jsonBody.value !== null
        ? (jsonBody.value as { decision?: unknown; note?: unknown })
        : {};
    const decision =
      body.decision === "verified" || body.decision === "rejected"
        ? body.decision
        : null;
    const note = typeof body.note === "string" ? body.note.trim() : "";
    if (!decision) {
      return Response.json(
        { error: "審査結果を選択してください。" },
        { status: 400, headers: PRIVATE_NO_STORE_HEADERS },
      );
    }
    if (!note || note.length > 500) {
      return Response.json(
        { error: "審査メモは1文字以上500文字以内で入力してください。" },
        { status: 400, headers: PRIVATE_NO_STORE_HEADERS },
      );
    }

    const { requestId } = await params;
    if (!requestId) {
      return Response.json(
        { error: "本人確認申請IDが不正です。" },
        { status: 400, headers: PRIVATE_NO_STORE_HEADERS },
      );
    }

    const result = await prisma.$transaction(async (transaction) => {
      await transaction.$executeRawUnsafe(
        "select pg_advisory_xact_lock(hashtextextended($1, 0))",
        requestId,
      );
      const verificationRequest =
        await transaction.identityVerificationRequest.findUnique({
          where: { id: requestId },
          select: {
            id: true,
            status: true,
            profileId: true,
            postingDeadlineAt: true,
            moderationCase: {
              select: {
                id: true,
                profileId: true,
                targetType: true,
                targetId: true,
                reasonCode: true,
                status: true,
                profile: {
                  select: {
                    status: true,
                    audioStatus: true,
                    accountModerationStatus: true,
                    suspensionAppealDueAt: true,
                    deletionProcessingStartedAt: true,
                  },
                },
              },
            },
          },
        });
      if (!verificationRequest) {
        return {
          error: "本人確認申請が見つかりません。",
          httpStatus: 404,
        } as const;
      }
      if (verificationRequest.status !== "pending") {
        return {
          error: "この本人確認申請は審査済みです。",
          httpStatus: 409,
        } as const;
      }
      const reviewedAt = new Date();
      if (verificationRequest.postingDeadlineAt <= reviewedAt) {
        await transaction.identityVerificationRequest.update({
          where: { id: verificationRequest.id },
          data: { status: "expired" },
        });
        return {
          error: "投稿期限を過ぎているため、この本人確認申請は審査できません。",
          httpStatus: 409,
        } as const;
      }
      const moderationCase = verificationRequest.moderationCase;
      if (
        moderationCase.reasonCode !== "impersonation" ||
        !openCaseStatuses.includes(
          moderationCase.status as (typeof openCaseStatuses)[number],
        )
      ) {
        return {
          error: "審査可能ななりすまし案件ではありません。",
          httpStatus: 409,
        } as const;
      }

      await transaction.identityVerificationRequest.update({
        where: { id: verificationRequest.id },
        data: {
          status: decision,
          reviewedByAdminUserId: authorization.admin.id,
          reviewNote: note,
          reviewedAt,
        },
      });

      let previousStatus: string = moderationCase.profile.status;
      let newStatus: string = previousStatus;
      let revocationId: string | null = null;
      let accountCorrection: SuspensionCorrectionResult = noSuspensionCorrection(
        "alreadyActive",
      );
      if (decision === "verified") {
        await transaction.moderationCase.update({
          where: { id: moderationCase.id },
          data: { status: "confirmed", resolvedAt: reviewedAt },
        });
        await transaction.moderationCaseEvent.create({
          data: {
            moderationCaseId: moderationCase.id,
            eventType: "reviewApproved",
            actorType: "admin",
            actorId: authorization.admin.id,
            previousStatus: moderationCase.status,
            newStatus: "confirmed",
            details: {
              reason: note,
              identityVerificationRequestId: verificationRequest.id,
            },
          },
        });

        const violation = await transaction.moderationViolationEvent.findFirst({
          where: {
            moderationCaseId: moderationCase.id,
            eventType: "confirmed",
            revocationEvents: { none: {} },
          },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          select: { id: true, reasonCode: true, suspensionTriggered: true },
        });
        if (violation?.reasonCode === "impersonation") {
          const revocation = await transaction.moderationViolationEvent.create({
            data: {
              profileId: moderationCase.profileId,
              moderationCaseId: moderationCase.id,
              adminUserId: authorization.admin.id,
              adminAuthId: authorization.admin.authId,
              adminRole: authorization.admin.role,
              eventType: "revoked",
              reasonCode: "impersonation",
              originalViolationEventId: violation.id,
              suspensionTriggered: false,
              note,
            },
            select: { id: true },
          });
          revocationId = revocation.id;

          if (!violation.suspensionTriggered) {
            accountCorrection = noSuspensionCorrection(
              "matchingViolationNotSuspensionTrigger",
            );
          } else if (
            moderationCase.profile.deletionProcessingStartedAt ||
            moderationCase.profile.accountModerationStatus ===
              "deletionPending"
          ) {
            accountCorrection = noSuspensionCorrection("deletionPending");
          } else if (
            moderationCase.profile.accountModerationStatus === "active"
          ) {
            accountCorrection = noSuspensionCorrection("alreadyActive");
          } else {
            const profileViolationEvents =
              await transaction.moderationViolationEvent.findMany({
                where: { profileId: moderationCase.profileId },
                orderBy: [{ createdAt: "asc" }, { id: "asc" }],
                select: {
                  id: true,
                  eventType: true,
                  reasonCode: true,
                  originalViolationEventId: true,
                },
              });
            const suspensionDecision = decideActiveViolationSuspension(
              profileViolationEvents as ViolationHistoryEvent[],
            );
            if (suspensionDecision.shouldSuspend) {
              accountCorrection = noSuspensionCorrection(
                "otherActiveViolations",
              );
            } else {
              await transaction.profile.update({
                where: { id: moderationCase.profileId },
                data: {
                  accountModerationStatus: "active",
                  suspensionAppealDueAt: null,
                },
              });
              accountCorrection = { corrected: true, reason: "corrected" };
              previousStatus = "suspended";
              newStatus = "active";
            }
          }
        } else {
          accountCorrection = noSuspensionCorrection("matchingViolationMissing");
        }
      } else {
        await transaction.moderationCase.update({
          where: { id: moderationCase.id },
          data: {
            status: "correctionRequired",
            resolvedAt: null,
            userMessage: note,
          },
        });
        await transaction.moderationCaseEvent.create({
          data: {
            moderationCaseId: moderationCase.id,
            eventType: "reviewRejected",
            actorType: "admin",
            actorId: authorization.admin.id,
            previousStatus: moderationCase.status,
            newStatus: "correctionRequired",
            details: {
              reason: note,
              identityVerificationRequestId: verificationRequest.id,
            },
          },
        });
      }

      if (decision === "rejected" || accountCorrection.corrected) {
        const isAccountCorrection =
          decision === "verified" && accountCorrection.corrected;
        const moderationAction = await transaction.moderationAction.create({
          data: {
            adminUserId: authorization.admin.id,
            profileId: moderationCase.profileId,
            targetType: isAccountCorrection
              ? "profile"
              : moderationCase.targetType,
            targetId: isAccountCorrection
              ? moderationCase.profileId
              : moderationCase.targetId,
            action: decision === "verified" ? "restore" : "hide",
            previousStatus,
            newStatus,
            reason: note,
          },
          select: { id: true },
        });
        await transaction.userNotification.create({
          data: {
            profileId: moderationCase.profileId,
            moderationActionId: moderationAction.id,
            title:
              isAccountCorrection
                ? "利用停止状態を訂正しました"
                : decision === "verified"
                  ? "本人確認が完了しました"
                  : "本人確認を完了できませんでした",
            message: note,
          },
        });
      }

      return {
        success: true,
        status: decision,
        caseStatus:
          decision === "verified" ? "confirmed" : "correctionRequired",
        restored: false,
        accountCorrection,
        revocationId,
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
    console.error("Failed to review identity verification request", error);
    return Response.json(
      { error: "本人確認の審査結果を保存できませんでした。" },
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
