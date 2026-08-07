import { authorizeAdminRequest } from "@/lib/adminAuth";
import type { Prisma } from "@/lib/generated/prisma/client";
import {
  consumeAdminActionIpRateLimit,
  consumeAdminActionRateLimit,
} from "@/lib/adminActionRateLimit";
import { getClientIp } from "@/lib/clientIp";
import { PRIVATE_NO_STORE_HEADERS } from "@/lib/httpCache";
import {
  compareModeratedContentHashes,
  compareModeratedUrls,
  compareModerationSnapshotVersions,
} from "@/lib/moderationRemediation";
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
        ? (jsonBody.value as {
            decision?: unknown;
            reason?: unknown;
            reviewedSnapshotId?: unknown;
          })
        : {};
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    const reviewedSnapshotId =
      typeof body.reviewedSnapshotId === "string"
        ? body.reviewedSnapshotId.trim()
        : "";
    if (!isDecision(body.decision) || !reason || reason.length > 500) {
      return Response.json(
        { error: "審査結果と500文字以内のユーザー向け理由を入力してください。" },
        { status: 400, headers: PRIVATE_NO_STORE_HEADERS },
      );
    }
    const decision = body.decision;
    if (decision === "approve" && !reviewedSnapshotId) {
      return Response.json(
        { error: "確認した審査対象のバージョンを指定してください。" },
        { status: 400, headers: PRIVATE_NO_STORE_HEADERS },
      );
    }

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
            select: { id: true, content: true, contentHash: true },
          },
          profile: {
            select: {
              status: true,
              audioStatus: true,
              displayName: true,
              bio: true,
              theme: true,
              audioKey: true,
              audioUrl: true,
              audioContentHash: true,
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
      const previousTargetStatus = getCurrentTargetStatus(moderationCase);
      let newTargetStatus = previousTargetStatus;
      let action: "hide" | "restore" | "suspend" | "remove";

      if (decision === "approve") {
        const latestSnapshot = moderationCase.snapshots[0];
        if (
          compareModerationSnapshotVersions(
            reviewedSnapshotId,
            latestSnapshot?.id,
          ) !== "current" ||
          !(await doesCurrentTargetMatchSnapshot(
            tx,
            moderationCase,
            latestSnapshot,
          ))
        ) {
          return {
            error:
              "審査対象が更新されています。最新の内容を読み込み直して確認してください。",
            httpStatus: 409,
          } as const;
        }
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
            details: { reason, targetWasDeleted, reviewedSnapshotId },
          },
        });
      } else {
        action = "hide";
        newTargetStatus = "hidden";
        await updateTargetStatus(tx, moderationCase, "hidden");
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
            details: { reason, decision, accountSuspended: false },
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
        accountSuspended: false,
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

async function doesCurrentTargetMatchSnapshot(
  tx: Prisma.TransactionClient,
  moderationCase: {
    targetType: "profile" | "audio" | "socialLink";
    targetId: string;
    profile: {
      displayName: string;
      bio: string;
      theme: string;
      audioKey: string;
      audioUrl: string;
      audioContentHash: string | null;
    };
  },
  snapshot:
    | { content: unknown; contentHash: string | null }
    | undefined,
): Promise<boolean> {
  if (!snapshot || !isRecord(snapshot.content)) return false;
  if (snapshot.content.deleted === true) {
    if (moderationCase.targetType === "audio") {
      return (
        !moderationCase.profile.audioKey && !moderationCase.profile.audioUrl
      );
    }
    if (moderationCase.targetType === "socialLink") {
      return (await tx.socialLink.findUnique({
        where: { id: moderationCase.targetId },
        select: { id: true },
      })) === null;
    }
    return false;
  }

  if (moderationCase.targetType === "profile") {
    return (
      snapshot.content.displayName === moderationCase.profile.displayName &&
      snapshot.content.bio === moderationCase.profile.bio &&
      snapshot.content.theme === moderationCase.profile.theme
    );
  }

  if (moderationCase.targetType === "audio") {
    if (snapshot.contentHash && moderationCase.profile.audioContentHash) {
      return (
        compareModeratedContentHashes(
          snapshot.contentHash,
          moderationCase.profile.audioContentHash,
        ) === "same"
      );
    }
    return (
      typeof snapshot.content.audioKey === "string" &&
      snapshot.content.audioKey === moderationCase.profile.audioKey
    );
  }

  const currentLink = await tx.socialLink.findUnique({
    where: { id: moderationCase.targetId },
    select: { service: true, url: true, label: true },
  });
  return (
    currentLink !== null &&
    snapshot.content.service === currentLink.service &&
    typeof snapshot.content.url === "string" &&
    compareModeratedUrls(snapshot.content.url, currentLink.url) === "same" &&
    snapshot.content.label === currentLink.label
  );
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
