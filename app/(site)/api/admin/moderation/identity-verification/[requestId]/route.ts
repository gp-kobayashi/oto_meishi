import type { Prisma } from "@/lib/generated/prisma/client";
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

const MAX_REVIEW_BODY_BYTES = 4 * 1024;
const openCaseStatuses = [
  "correctionRequired",
  "postReviewPending",
  "preReviewPending",
] as const;

type Transaction = Prisma.TransactionClient;

async function restoreTargetIfAllowed(
  transaction: Transaction,
  moderationCase: {
    id: string;
    profileId: string;
    targetType: "profile" | "audio" | "socialLink";
    targetId: string;
    profile: {
      status: "active" | "hidden" | "suspended";
      audioStatus: "active" | "hidden" | "removed";
      accountModerationStatus: "active" | "suspended" | "deletionPending";
    };
  },
) {
  const accountActive =
    moderationCase.profile.accountModerationStatus === "active";
  const otherOpenCases = await transaction.moderationCase.count({
    where: {
      id: { not: moderationCase.id },
      profileId: moderationCase.profileId,
      status: { in: [...openCaseStatuses] },
      ...(moderationCase.targetType === "profile"
        ? { targetType: "profile" }
        : {
            targetType: moderationCase.targetType,
            targetId: moderationCase.targetId,
          }),
    },
  });
  const canRestore = accountActive && otherOpenCases === 0;

  if (moderationCase.targetType === "profile") {
    const previousStatus = moderationCase.profile.status;
    if (canRestore) {
      await transaction.profile.update({
        where: { id: moderationCase.profileId },
        data: { status: "active" },
      });
    }
    return {
      previousStatus,
      newStatus: canRestore ? "active" : previousStatus,
    };
  }

  if (moderationCase.targetType === "audio") {
    const previousStatus = moderationCase.profile.audioStatus;
    if (canRestore && previousStatus !== "removed") {
      await transaction.profile.update({
        where: { id: moderationCase.profileId },
        data: { audioStatus: "active" },
      });
      return { previousStatus, newStatus: "active" };
    }
    return { previousStatus, newStatus: previousStatus };
  }

  const socialLink = await transaction.socialLink.findFirst({
    where: {
      id: moderationCase.targetId,
      profileId: moderationCase.profileId,
    },
    select: { status: true },
  });
  const previousStatus = socialLink?.status ?? "hidden";
  if (canRestore && socialLink) {
    await transaction.socialLink.update({
      where: { id: moderationCase.targetId },
      data: { status: "active" },
    });
  }
  return {
    previousStatus,
    newStatus: canRestore && socialLink ? "active" : previousStatus,
  };
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ requestId: string }> },
) {
  try {
    const authorization = await authorizeAdminRequest(request);
    if (!authorization.ok) return authorization.response;

    const rateLimit = consumeAdminActionRateLimit(authorization.admin.id);
    if (!rateLimit.allowed) {
      return rateLimitResponse(rateLimit.retryAfterSeconds);
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

      const reviewedAt = new Date();
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
      if (decision === "verified") {
        const targetStatus = await restoreTargetIfAllowed(
          transaction,
          moderationCase,
        );
        previousStatus = targetStatus.previousStatus;
        newStatus = targetStatus.newStatus;

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
          select: { id: true, reasonCode: true },
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

      const moderationAction = await transaction.moderationAction.create({
        data: {
          adminUserId: authorization.admin.id,
          profileId: moderationCase.profileId,
          targetType: moderationCase.targetType,
          targetId: moderationCase.targetId,
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
            decision === "verified"
              ? "本人確認が完了しました"
              : "本人確認を完了できませんでした",
          message: note,
        },
      });

      return {
        success: true,
        status: decision,
        caseStatus:
          decision === "verified" ? "confirmed" : "correctionRequired",
        restored: decision === "verified" && newStatus === "active",
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
