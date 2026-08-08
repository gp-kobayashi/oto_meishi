import { Prisma } from "@/lib/generated/prisma/client";
import { getClientIp } from "@/lib/clientIp";
import { PRIVATE_NO_STORE_HEADERS } from "@/lib/httpCache";
import {
  consumeModerationRequestIpRateLimit,
  consumeModerationRequestUserRateLimit,
} from "@/lib/moderationRequestRateLimit";
import { prisma } from "@/lib/prisma";
import { authorizeProfileOwnerRequest } from "@/lib/profileOwnerAuth";
import { readJsonBody } from "@/lib/requestJson";
import { hasJsonContentType } from "@/lib/requestContentType";

const MAX_REQUEST_BODY_BYTES = 8 * 1024;

const serializeRequest = (request: {
  id: string;
  kind: "inquiry" | "accountAppeal";
  status: "pending" | "resolved" | "rejected";
  message: string;
  responseMessage: string;
  resolvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}) => ({
  ...request,
  resolvedAt: request.resolvedAt?.toISOString() ?? null,
  createdAt: request.createdAt.toISOString(),
  updatedAt: request.updatedAt.toISOString(),
});

const rateLimitResponse = (
  message: string,
  result: { retryAfterSeconds: number },
) =>
  Response.json(
    {
      error: message,
      retryAfterSeconds: result.retryAfterSeconds,
    },
    {
      status: 429,
      headers: {
        ...PRIVATE_NO_STORE_HEADERS,
        "Retry-After": String(result.retryAfterSeconds),
      },
    },
  );

export async function GET(request: Request) {
  try {
    const authorization = await authorizeProfileOwnerRequest(request);
    if (!authorization.ok) return authorization.response;

    const [profile, requests] = await prisma.$transaction([
      prisma.profile.findUnique({
        where: { id: authorization.profileId },
        select: {
          status: true,
          accountModerationStatus: true,
          suspensionAppealDueAt: true,
          deletionScheduledAt: true,
          audioStatus: true,
          sns: {
            where: { status: "hidden" },
            select: { id: true },
            take: 1,
          },
          moderationCases: {
            where: {
              status: {
                in: [
                  "correctionRequired",
                  "postReviewPending",
                  "preReviewPending",
                ],
              },
            },
            select: { id: true },
            take: 1,
          },
        },
      }),
      prisma.moderationRequest.findMany({
        where: { profileId: authorization.profileId },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 20,
        select: {
          id: true,
          kind: true,
          status: true,
          message: true,
          responseMessage: true,
          resolvedAt: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
    ]);

    if (!profile) {
      return Response.json(
        { error: "プロフィールが見つかりません。" },
        { status: 404, headers: PRIVATE_NO_STORE_HEADERS },
      );
    }

    const isSuspended =
      profile.status === "suspended" ||
      profile.accountModerationStatus === "suspended";
    const isDeletionPending =
      profile.accountModerationStatus === "deletionPending";
    const hasModeratedContent =
      profile.status === "hidden" ||
      profile.audioStatus !== "active" ||
      profile.sns.length > 0 ||
      profile.moderationCases.length > 0;

    return Response.json(
      {
        eligibility: {
          accountStatus: profile.accountModerationStatus,
          kind: isDeletionPending
            ? null
            : isSuspended
            ? "accountAppeal"
            : hasModeratedContent
              ? "inquiry"
              : null,
          suspensionAppealDueAt:
            profile.suspensionAppealDueAt?.toISOString() ?? null,
          deletionScheduledAt:
            profile.deletionScheduledAt?.toISOString() ?? null,
        },
        requests: requests.map(serializeRequest),
      },
      { headers: PRIVATE_NO_STORE_HEADERS },
    );
  } catch (error) {
    console.error("Failed to load moderation requests", error);
    return Response.json(
      { error: "申請状況を取得できませんでした。" },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS },
    );
  }
}

export async function POST(request: Request) {
  try {
    const authorization = await authorizeProfileOwnerRequest(request);
    if (!authorization.ok) return authorization.response;

    const userRateLimit = consumeModerationRequestUserRateLimit(
      authorization.userId,
    );
    if (!userRateLimit.allowed) {
      return rateLimitResponse(
        "申請は1日5回までです。時間をおいて再度お試しください。",
        userRateLimit,
      );
    }
    const clientIp = getClientIp(request.headers);
    if (clientIp) {
      const ipRateLimit = consumeModerationRequestIpRateLimit(clientIp);
      if (!ipRateLimit.allowed) {
        return rateLimitResponse(
          "この接続元からの申請が集中しています。時間をおいて再度お試しください。",
          ipRateLimit,
        );
      }
    }

    if (!hasJsonContentType(request)) {
      return Response.json(
        { error: "Content-Typeはapplication/jsonを指定してください。" },
        { status: 415, headers: PRIVATE_NO_STORE_HEADERS },
      );
    }
    const jsonBody = await readJsonBody(request, MAX_REQUEST_BODY_BYTES);
    if (!jsonBody.ok) {
      return Response.json(
        {
          error:
            jsonBody.error === "too_large"
              ? "申請内容は8KB以下にしてください。"
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
        ? (jsonBody.value as { message?: unknown })
        : {};
    const message = typeof body.message === "string" ? body.message.trim() : "";
    if (!message || message.length > 500) {
      return Response.json(
        { error: "申請内容を1文字以上500文字以内で入力してください。" },
        { status: 400, headers: PRIVATE_NO_STORE_HEADERS },
      );
    }

    const profile = await prisma.profile.findUnique({
      where: { id: authorization.profileId },
      select: {
        status: true,
        accountModerationStatus: true,
        suspensionAppealDueAt: true,
        audioStatus: true,
        sns: {
          where: { status: "hidden" },
          select: { id: true },
          take: 1,
        },
        moderationCases: {
          where: {
            status: {
              in: [
                "correctionRequired",
                "postReviewPending",
                "preReviewPending",
              ],
            },
          },
          select: { id: true },
          take: 1,
        },
      },
    });
    if (!profile) {
      return Response.json(
        { error: "プロフィールが見つかりません。" },
        { status: 404, headers: PRIVATE_NO_STORE_HEADERS },
      );
    }

    const isSuspended =
      profile.status === "suspended" ||
      profile.accountModerationStatus === "suspended";
    if (profile.accountModerationStatus === "deletionPending") {
      return Response.json(
        { error: "削除手続き中のため申請できません。" },
        { status: 403, headers: PRIVATE_NO_STORE_HEADERS },
      );
    }
    const kind = isSuspended ? "accountAppeal" : "inquiry";
    if (
      isSuspended &&
      (!profile.suspensionAppealDueAt ||
        profile.suspensionAppealDueAt.getTime() < Date.now())
    ) {
      return Response.json(
        { error: "利用停止から60日間の申請期間を過ぎています。" },
        { status: 403, headers: PRIVATE_NO_STORE_HEADERS },
      );
    }
    const hasModeratedContent =
      profile.status === "hidden" ||
      profile.audioStatus !== "active" ||
      profile.sns.length > 0 ||
      profile.moderationCases.length > 0;
    if (!isSuspended && !hasModeratedContent) {
      return Response.json(
        { error: "現在、問い合わせ対象のモデレーション対応はありません。" },
        { status: 403, headers: PRIVATE_NO_STORE_HEADERS },
      );
    }

    const pendingRequest = await prisma.moderationRequest.findFirst({
      where: {
        profileId: authorization.profileId,
        kind,
        status: "pending",
      },
      select: { id: true },
    });
    if (pendingRequest) {
      return Response.json(
        { error: "同じ種類の申請を確認中です。回答をお待ちください。" },
        { status: 409, headers: PRIVATE_NO_STORE_HEADERS },
      );
    }

    const created = await prisma.moderationRequest.create({
      data: {
        profileId: authorization.profileId,
        kind,
        message,
      },
      select: {
        id: true,
        kind: true,
        status: true,
        message: true,
        responseMessage: true,
        resolvedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return Response.json(serializeRequest(created), {
      status: 201,
      headers: PRIVATE_NO_STORE_HEADERS,
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return Response.json(
        { error: "同じ種類の申請を確認中です。回答をお待ちください。" },
        { status: 409, headers: PRIVATE_NO_STORE_HEADERS },
      );
    }
    console.error("Failed to submit moderation request", error);
    return Response.json(
      { error: "申請を送信できませんでした。" },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS },
    );
  }
}
