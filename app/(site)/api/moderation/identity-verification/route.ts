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
const POSTING_WINDOW_MS = 10 * 60 * 1000;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const openCaseStatuses = [
  "correctionRequired",
  "postReviewPending",
  "preReviewPending",
] as const;

const serializeRequest = (request: {
  id: string;
  moderationCaseId: string;
  socialLinkId: string | null;
  socialUrl: string;
  plannedContent: string;
  status: "pending" | "verified" | "rejected" | "expired";
  postingDeadlineAt: Date;
  reviewNote: string;
  reviewedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}) => ({
  ...request,
  status:
    request.status === "pending" &&
    request.postingDeadlineAt.getTime() <= Date.now()
      ? "expired"
      : request.status,
  postingDeadlineAt: request.postingDeadlineAt.toISOString(),
  reviewedAt: request.reviewedAt?.toISOString() ?? null,
  createdAt: request.createdAt.toISOString(),
  updatedAt: request.updatedAt.toISOString(),
});

const rateLimitResponse = (
  message: string,
  result: { retryAfterSeconds: number },
) =>
  Response.json(
    { error: message, retryAfterSeconds: result.retryAfterSeconds },
    {
      status: 429,
      headers: {
        ...PRIVATE_NO_STORE_HEADERS,
        "Retry-After": String(result.retryAfterSeconds),
      },
    },
  );

const requestSelection = {
  id: true,
  moderationCaseId: true,
  socialLinkId: true,
  socialUrl: true,
  plannedContent: true,
  status: true,
  postingDeadlineAt: true,
  reviewNote: true,
  reviewedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

export async function GET(request: Request) {
  try {
    const authorization = await authorizeProfileOwnerRequest(request);
    if (!authorization.ok) return authorization.response;

    const profile = await prisma.profile.findUnique({
      where: { id: authorization.profileId },
      select: {
        moderationCases: {
          where: {
            reasonCode: "impersonation",
            status: { in: [...openCaseStatuses] },
          },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          select: {
            id: true,
            status: true,
            userMessage: true,
            createdAt: true,
          },
        },
        sns: {
          orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
          select: {
            id: true,
            service: true,
            label: true,
            url: true,
            status: true,
          },
        },
        identityVerificationRequests: {
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: 20,
          select: requestSelection,
        },
      },
    });

    if (!profile) {
      return Response.json(
        { error: "プロフィールが見つかりません。" },
        { status: 404, headers: PRIVATE_NO_STORE_HEADERS },
      );
    }

    return Response.json(
      {
        cases: profile.moderationCases.map((moderationCase) => ({
          ...moderationCase,
          createdAt: moderationCase.createdAt.toISOString(),
        })),
        socialLinks: profile.sns,
        requests: profile.identityVerificationRequests.map(serializeRequest),
      },
      { headers: PRIVATE_NO_STORE_HEADERS },
    );
  } catch (error) {
    console.error("Failed to load identity verification requests", error);
    return Response.json(
      { error: "本人確認申請を取得できませんでした。" },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS },
    );
  }
}

export async function POST(request: Request) {
  try {
    const authorization = await authorizeProfileOwnerRequest(request);
    if (!authorization.ok) return authorization.response;

    const userRateLimit = await consumeModerationRequestUserRateLimit(
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
      const ipRateLimit = await consumeModerationRequestIpRateLimit(clientIp);
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
        ? (jsonBody.value as {
            moderationCaseId?: unknown;
            socialLinkId?: unknown;
            plannedContent?: unknown;
          })
        : {};
    const moderationCaseId =
      typeof body.moderationCaseId === "string"
        ? body.moderationCaseId.trim()
        : "";
    const socialLinkId =
      typeof body.socialLinkId === "string" ? body.socialLinkId.trim() : "";
    const plannedContent =
      typeof body.plannedContent === "string" ? body.plannedContent.trim() : "";

    if (
      !UUID_PATTERN.test(moderationCaseId) ||
      !UUID_PATTERN.test(socialLinkId)
    ) {
      return Response.json(
        { error: "本人確認の対象を正しく選択してください。" },
        { status: 400, headers: PRIVATE_NO_STORE_HEADERS },
      );
    }
    if (!plannedContent || plannedContent.length > 500) {
      return Response.json(
        { error: "投稿予定内容を1文字以上500文字以内で入力してください。" },
        { status: 400, headers: PRIVATE_NO_STORE_HEADERS },
      );
    }

    const [moderationCase, socialLink] = await prisma.$transaction([
      prisma.moderationCase.findFirst({
        where: {
          id: moderationCaseId,
          profileId: authorization.profileId,
          reasonCode: "impersonation",
          status: { in: [...openCaseStatuses] },
        },
        select: { id: true },
      }),
      prisma.socialLink.findFirst({
        where: { id: socialLinkId, profileId: authorization.profileId },
        select: { id: true, url: true },
      }),
    ]);

    if (!moderationCase) {
      return Response.json(
        { error: "本人確認が必要ななりすまし対応はありません。" },
        { status: 403, headers: PRIVATE_NO_STORE_HEADERS },
      );
    }
    if (!socialLink) {
      return Response.json(
        { error: "登録済みのSNSリンクを選択してください。" },
        { status: 400, headers: PRIVATE_NO_STORE_HEADERS },
      );
    }

    const now = new Date();
    const postingDeadlineAt = new Date(now.getTime() + POSTING_WINDOW_MS);
    const created = await prisma.$transaction(async (transaction) => {
      await transaction.identityVerificationRequest.updateMany({
        where: {
          moderationCaseId,
          status: "pending",
          postingDeadlineAt: { lte: now },
        },
        data: { status: "expired" },
      });
      return transaction.identityVerificationRequest.create({
        data: {
          profileId: authorization.profileId,
          moderationCaseId,
          socialLinkId,
          socialUrl: socialLink.url,
          plannedContent,
          postingDeadlineAt,
        },
        select: requestSelection,
      });
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
        { error: "この対応について確認中または投稿期限内の申請があります。" },
        { status: 409, headers: PRIVATE_NO_STORE_HEADERS },
      );
    }
    console.error("Failed to submit identity verification request", error);
    return Response.json(
      { error: "本人確認申請を送信できませんでした。" },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS },
    );
  }
}
