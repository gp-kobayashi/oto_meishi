import { authorizeAdminRequest } from "@/lib/adminAuth";
import {
  consumeAdminActionIpRateLimit,
  consumeAdminActionRateLimit,
} from "@/lib/adminActionRateLimit";
import { getClientIp } from "@/lib/clientIp";
import { PRIVATE_NO_STORE_HEADERS } from "@/lib/httpCache";
import { prisma } from "@/lib/prisma";
import { readJsonBody } from "@/lib/requestJson";
import { hasJsonContentType } from "@/lib/requestContentType";

const MAX_BODY_BYTES = 8 * 1024;

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ requestId: string }> },
) {
  try {
    const authorization = await authorizeAdminRequest(request);
    if (!authorization.ok) return authorization.response;

    const userRateLimit = await consumeAdminActionRateLimit(
      authorization.admin.id,
    );
    if (!userRateLimit.allowed) {
      return Response.json(
        { error: "管理操作の上限に達しました。しばらくお待ちください。" },
        {
          status: 429,
          headers: {
            ...PRIVATE_NO_STORE_HEADERS,
            "Retry-After": String(userRateLimit.retryAfterSeconds),
          },
        },
      );
    }
    const clientIp = getClientIp(request.headers);
    if (clientIp) {
      const ipRateLimit = await consumeAdminActionIpRateLimit(clientIp);
      if (!ipRateLimit.allowed) {
        return Response.json(
          {
            error:
              "この接続元からの管理操作が集中しています。しばらくお待ちください。",
          },
          {
            status: 429,
            headers: {
              ...PRIVATE_NO_STORE_HEADERS,
              "Retry-After": String(ipRateLimit.retryAfterSeconds),
            },
          },
        );
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
              ? "回答内容は8KB以下にしてください。"
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
        ? (jsonBody.value as { status?: unknown; responseMessage?: unknown })
        : {};
    const status =
      body.status === "resolved" || body.status === "rejected"
        ? body.status
        : null;
    const responseMessage =
      typeof body.responseMessage === "string"
        ? body.responseMessage.trim()
        : "";
    if (!status || !responseMessage || responseMessage.length > 500) {
      return Response.json(
        { error: "結果と500文字以内のユーザー向け回答を入力してください。" },
        { status: 400, headers: PRIVATE_NO_STORE_HEADERS },
      );
    }

    const { requestId } = await params;
    const result = await prisma.$transaction(async (tx) => {
      const moderationRequest = await tx.moderationRequest.findUnique({
        where: { id: requestId },
        select: {
          id: true,
          profileId: true,
          kind: true,
          status: true,
          profile: {
            select: {
              status: true,
              accountModerationStatus: true,
            },
          },
        },
      });
      if (!moderationRequest) {
        return { error: "申請が見つかりません。", httpStatus: 404 } as const;
      }
      if (moderationRequest.status !== "pending") {
        return {
          error: "この申請はすでに対応済みです。",
          httpStatus: 409,
        } as const;
      }

      await tx.$executeRawUnsafe(
        "select pg_advisory_xact_lock(hashtextextended($1, 0))",
        `profile:${moderationRequest.profileId}`,
      );
      await tx.$executeRawUnsafe(
        "select pg_advisory_xact_lock(hashtextextended($1, 0))",
        `moderation-request:${requestId}`,
      );
      const latestRequest = await tx.moderationRequest.findUnique({
        where: { id: requestId },
        select: { status: true, profileId: true, kind: true },
      });
      if (
        !latestRequest ||
        latestRequest.profileId !== moderationRequest.profileId
      ) {
        return { error: "申請が見つかりません。", httpStatus: 404 } as const;
      }
      if (latestRequest.kind !== moderationRequest.kind) {
        return { error: "申請が見つかりません。", httpStatus: 404 } as const;
      }
      if (latestRequest.status !== "pending") {
        return {
          error: "この申請はすでに対応済みです。",
          httpStatus: 409,
        } as const;
      }
      const lockedProfile = await tx.profile.findUnique({
        where: { id: moderationRequest.profileId },
        select: { status: true, accountModerationStatus: true },
      });
      if (!lockedProfile) {
        return {
          error: "プロフィールが見つかりません。",
          httpStatus: 404,
        } as const;
      }
      const lockedModerationRequest = {
        ...moderationRequest,
        profile: lockedProfile,
      };

      if (
        lockedModerationRequest.kind === "accountAppeal" &&
        status === "resolved"
      ) {
        const incompleteCaseCount = await tx.moderationCase.count({
          where: {
            profileId: lockedModerationRequest.profileId,
            status: {
              in: [
                "correctionRequired",
                "postReviewPending",
                "preReviewPending",
              ],
            },
          },
        });
        if (incompleteCaseCount > 0) {
          return {
            error: "未完了のモデレーションケースがあるため解除できません。",
            httpStatus: 409,
          } as const;
        }
      }

      const resolvedAt = new Date();
      await tx.moderationRequest.update({
        where: { id: requestId },
        data: { status, responseMessage, resolvedAt },
      });

      if (
        lockedModerationRequest.kind === "accountAppeal" &&
        status === "resolved"
      ) {
        await tx.profile.update({
          where: { id: moderationRequest.profileId },
          data: {
            status: "active",
            accountModerationStatus: "active",
            suspensionAppealDueAt: null,
          },
        });
        await tx.moderationAction.create({
          data: {
            adminUserId: authorization.admin.id,
            profileId: moderationRequest.profileId,
            targetType: "profile",
            targetId: moderationRequest.profileId,
            action: "restore",
            previousStatus: lockedModerationRequest.profile.status,
            newStatus: "active",
            reason: responseMessage,
          },
        });
      }

      return { success: true, status, resolvedAt } as const;
    });

    if ("error" in result) {
      return Response.json(
        { error: result.error },
        { status: result.httpStatus, headers: PRIVATE_NO_STORE_HEADERS },
      );
    }
    return Response.json(
      {
        ...result,
        resolvedAt: result.resolvedAt.toISOString(),
      },
      { headers: PRIVATE_NO_STORE_HEADERS },
    );
  } catch (error) {
    console.error("Failed to resolve moderation request", error);
    return Response.json(
      { error: "申請へ回答できませんでした。" },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS },
    );
  }
}
