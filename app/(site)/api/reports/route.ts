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
};

function isReportReason(value: unknown): value is ReportReason {
  return (
    typeof value === "string" &&
    reportReasons.includes(value as ReportReason)
  );
}

export async function POST(request: Request) {
  try {
    const clientIp = getClientIp(request.headers);
    if (clientIp) {
      const rateLimit = consumeReportIpRateLimit(clientIp);
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
    const details =
      typeof body.details === "string" ? body.details.trim() : "";

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
    if (details.length > MAX_REPORT_DETAILS_LENGTH) {
      return NextResponse.json(
        { error: "通報の詳細は500文字までです。" },
        { status: 400, headers: PRIVATE_NO_STORE_HEADERS },
      );
    }

    if (clientIp) {
      const targetRateLimit = consumeReportTargetRateLimit(
        clientIp,
        profileId,
      );
      if (!targetRateLimit.allowed) {
        return NextResponse.json(
          {
            error:
              "同じプロフィールへの通報が続いています。しばらく待ってから再度お試しください。",
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
      select: { id: true, status: true },
    });
    if (!profile || profile.status !== "active") {
      return NextResponse.json(
        { error: "通報対象が見つかりません。" },
        { status: 404, headers: PRIVATE_NO_STORE_HEADERS },
      );
    }

    await prisma.contentReport.create({
      data: {
        profileId: profile.id,
        reason: body.reason,
        details,
      },
      select: { id: true },
    });

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
