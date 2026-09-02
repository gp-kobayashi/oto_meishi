import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { PRIVATE_NO_STORE_HEADERS } from "@/lib/httpCache";
import { readJsonBody } from "@/lib/requestJson";
import { hasJsonContentType } from "@/lib/requestContentType";
import { getClientIp } from "@/lib/clientIp";
import {
  consumeReportIpRateLimit,
  consumeReportTargetRateLimit,
} from "@/lib/reportRateLimit";
import { verifyPublicReportToken } from "@/lib/publicReportToken";
import { lockModerationProfile } from "@/lib/moderationTransactionLock";

const MAX_REPORT_BODY_BYTES = 8 * 1024;
const MAX_PROFILE_ID_LENGTH = 100;
const MAX_REPORT_DETAILS_LENGTH = 500;

const reportReasons = [
  "inappropriate_audio",
  "harassment",
  "unsafe_link",
  "impersonation",
  "other",
] as const;

type ReportReason = (typeof reportReasons)[number];

type ReportRequestBody = {
  profileId?: unknown;
  reason?: unknown;
  details?: unknown;
  targetType?: unknown;
  targetId?: unknown;
  reportToken?: unknown;
};

function isReportReason(value: unknown): value is ReportReason {
  return (
    typeof value === "string" && reportReasons.includes(value as ReportReason)
  );
}

export async function POST(request: Request) {
  try {
    const clientIp = getClientIp(request.headers);
    if (clientIp) {
      const rateLimit = await consumeReportIpRateLimit(clientIp);
      if (!rateLimit.allowed) {
        return NextResponse.json(
          {
            error:
              "通報の送信回数が上限に達しました。しばらく待ってから再度お試しください。",
          },
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
      }
    }

    if (!hasJsonContentType(request)) {
      return NextResponse.json(
        { error: "Content-Typeはapplication/jsonを指定してください。" },
        { status: 415, headers: PRIVATE_NO_STORE_HEADERS },
      );
    }

    const jsonBody = await readJsonBody(request, MAX_REPORT_BODY_BYTES);
    if (!jsonBody.ok) {
      return NextResponse.json(
        {
          error:
            jsonBody.error === "too_large"
              ? "通報データは8KB以下にしてください。"
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
        ? (jsonBody.value as ReportRequestBody)
        : {};
    const profileId =
      typeof body.profileId === "string" ? body.profileId.trim() : "";
    const details = typeof body.details === "string" ? body.details.trim() : "";
    const targetType =
      body.targetType === "profile" ||
      body.targetType === "audio" ||
      body.targetType === "socialLink"
        ? body.targetType
        : "";
    const targetId =
      typeof body.targetId === "string" ? body.targetId.trim() : "";
    const reportToken = body.reportToken;

    if (!profileId || profileId.length > MAX_PROFILE_ID_LENGTH) {
      return NextResponse.json(
        { error: "通報対象が不正です。" },
        { status: 400, headers: PRIVATE_NO_STORE_HEADERS },
      );
    }
    if (!isReportReason(body.reason)) {
      return NextResponse.json(
        { error: "通報理由を選択してください。" },
        { status: 400, headers: PRIVATE_NO_STORE_HEADERS },
      );
    }
    if (!targetType || !targetId || targetId.length > MAX_PROFILE_ID_LENGTH) {
      return NextResponse.json(
        { error: "通報対象が不正です。" },
        { status: 400, headers: PRIVATE_NO_STORE_HEADERS },
      );
    }
    const reason = body.reason;
    const expectedTargetType =
      reason === "inappropriate_audio"
        ? "audio"
        : reason === "unsafe_link"
          ? "socialLink"
          : "profile";
    if (
      targetType !== expectedTargetType ||
      (targetType === "profile" && targetId !== profileId)
    ) {
      return NextResponse.json(
        { error: "通報理由と対象の組み合わせが不正です。" },
        { status: 400, headers: PRIVATE_NO_STORE_HEADERS },
      );
    }
    if (details.length > MAX_REPORT_DETAILS_LENGTH) {
      return NextResponse.json(
        { error: "通報の詳細は500文字までです。" },
        { status: 400, headers: PRIVATE_NO_STORE_HEADERS },
      );
    }
    if (
      reportToken !== undefined &&
      !verifyPublicReportToken(reportToken, profileId)
    ) {
      return NextResponse.json(
        { error: "通報対象が見つかりません。" },
        { status: 404, headers: PRIVATE_NO_STORE_HEADERS },
      );
    }

    if (clientIp) {
      const targetRateLimit = await consumeReportTargetRateLimit(
        clientIp,
        targetType,
        targetId,
      );
      if (!targetRateLimit.allowed) {
        return NextResponse.json(
          {
            error:
              "同じ対象への通報が続いています。しばらく待ってから再度お試しください。",
          },
          {
            status: 429,
            headers: {
              ...PRIVATE_NO_STORE_HEADERS,
              "Retry-After": String(targetRateLimit.retryAfterSeconds),
              "X-RateLimit-Limit": String(targetRateLimit.limit),
              "X-RateLimit-Remaining": String(targetRateLimit.remaining),
              "X-RateLimit-Reset": String(
                Math.ceil(targetRateLimit.resetAt / 1000),
              ),
            },
          },
        );
      }
    }

    const profile = await prisma.profile.findUnique({
      where: { id: profileId },
      select: {
        id: true,
        status: true,
        displayName: true,
        bio: true,
        theme: true,
        audioUrl: true,
        audioKey: true,
        audioTitle: true,
        audioStatus: true,
        audioContentHash: true,
        sns: {
          select: {
            id: true,
            service: true,
            label: true,
            url: true,
            status: true,
          },
        },
      },
    });
    if (!profile || profile.status !== "active") {
      return NextResponse.json(
        { error: "通報対象が見つかりません。" },
        { status: 404, headers: PRIVATE_NO_STORE_HEADERS },
      );
    }

    const targetLink =
      targetType === "socialLink"
        ? profile.sns.find((link) => link.id === targetId)
        : null;
    const target =
      targetType === "socialLink"
        ? targetLink
        : targetType === "audio"
          ? profile.audioStatus === "active" &&
            Boolean(profile.audioKey || profile.audioUrl)
            ? profile
            : null
          : profile;
    if (
      !target ||
      (targetType === "socialLink" && target.status !== "active") ||
      (targetType === "audio" && profile.audioStatus !== "active")
    ) {
      return NextResponse.json(
        { error: "通報対象が見つかりません。" },
        { status: 404, headers: PRIVATE_NO_STORE_HEADERS },
      );
    }
    const targetSnapshot =
      targetType === "profile"
        ? {
            displayName: profile.displayName,
            bio: profile.bio,
            theme: profile.theme,
            status: profile.status,
          }
        : targetType === "audio"
          ? {
              audioTitle: profile.audioTitle,
              audioStatus: profile.audioStatus,
              hasAudio: true,
              audioContentHash: profile.audioContentHash,
            }
          : {
              service: targetLink!.service,
              label: targetLink!.label,
              url: targetLink!.url,
              status: targetLink!.status,
            };
    const createReport = async (tx: typeof prisma) => {
      return tx.contentReport.create({
        data: {
          profileId: profile.id,
          targetType,
          targetId,
          targetSnapshot,
          reason,
          details,
        },
        select: { id: true },
      });
    };
    const created =
      typeof prisma.$transaction !== "function"
        ? await createReport(prisma)
        : await prisma.$transaction(async (tx) => {
            await lockModerationProfile(tx, profile.id);
            const current = await tx.profile.findUnique({
              where: { id: profile.id },
              select: {
                status: true,
                audioStatus: true,
                audioKey: true,
                audioUrl: true,
                sns: { select: { id: true, status: true } },
              },
            });
            const currentLink = current?.sns.find(
              (link) => link.id === targetId,
            );
            const stillPublic =
              current?.status === "active" &&
              (targetType !== "audio" ||
                (current.audioStatus === "active" &&
                  Boolean(current.audioKey || current.audioUrl))) &&
              (targetType !== "socialLink" || currentLink?.status === "active");
            if (!stillPublic) return null;

            const moderationCase = await tx.moderationCase.findFirst({
              where: {
                profileId: profile.id,
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
              orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
              select: { id: true },
            });
            const moderationAction = moderationCase
              ? await tx.moderationAction.findFirst({
                  where: { profileId: profile.id, targetType, targetId },
                  orderBy: [{ createdAt: "desc" }, { id: "desc" }],
                  select: { id: true },
                })
              : null;
            return tx.contentReport.create({
              data: {
                profileId: profile.id,
                targetType,
                targetId,
                targetSnapshot,
                reason,
                details,
                moderationCaseId: moderationCase?.id,
                moderationActionId: moderationAction?.id,
              },
              select: { id: true },
            });
          });
    if (!created) {
      return NextResponse.json(
        { error: "通報対象が見つかりません。" },
        { status: 404, headers: PRIVATE_NO_STORE_HEADERS },
      );
    }

    return NextResponse.json(
      { success: true },
      { status: 201, headers: PRIVATE_NO_STORE_HEADERS },
    );
  } catch (error) {
    console.error("Failed to create content report", error);
    return NextResponse.json(
      { error: "通報を受け付けられませんでした。" },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS },
    );
  }
}
