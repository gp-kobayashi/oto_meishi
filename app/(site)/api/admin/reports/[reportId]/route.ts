import { authorizeAdminRequest } from "@/lib/adminAuth";
import {
  consumeAdminActionIpRateLimit,
  consumeAdminActionRateLimit,
} from "@/lib/adminActionRateLimit";
import { getClientIp } from "@/lib/clientIp";
import { PRIVATE_NO_STORE_HEADERS } from "@/lib/httpCache";
import { prisma } from "@/lib/prisma";
import { hasJsonContentType } from "@/lib/requestContentType";
import { readJsonBody } from "@/lib/requestJson";

const MAX_REPORT_STATUS_BODY_BYTES = 4 * 1024;
const reportStatuses = ["reviewed", "resolved", "dismissed"] as const;

type ReportStatus = (typeof reportStatuses)[number];
type CurrentReportStatus = "pending" | ReportStatus;
type ReportStatusRequest = { status?: unknown; note?: unknown };

const allowedReportStatusTransitions: Record<
  CurrentReportStatus,
  readonly ReportStatus[]
> = {
  pending: ["reviewed", "resolved", "dismissed"],
  reviewed: ["resolved", "dismissed"],
  resolved: [],
  dismissed: [],
};

const isReportStatus = (value: unknown): value is ReportStatus =>
  typeof value === "string" && reportStatuses.includes(value as ReportStatus);

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ reportId: string }> },
) {
  try {
    const authorization = await authorizeAdminRequest(request);
    if (!authorization.ok) return authorization.response;

    const rateLimit = consumeAdminActionRateLimit(authorization.admin.id);
    if (!rateLimit.allowed) {
      return Response.json(
        { error: "管理操作の回数が上限に達しました。しばらくお待ちください。" },
        {
          status: 429,
          headers: {
            ...PRIVATE_NO_STORE_HEADERS,
            "Retry-After": String(rateLimit.retryAfterSeconds),
          },
        },
      );
    }

    const clientIp = getClientIp(request.headers);
    if (clientIp) {
      const ipRateLimit = consumeAdminActionIpRateLimit(clientIp);
      if (!ipRateLimit.allowed) {
        return Response.json(
          { error: "この接続元からの管理操作が集中しています。しばらくお待ちください。" },
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

    const jsonBody = await readJsonBody(request, MAX_REPORT_STATUS_BODY_BYTES);
    if (!jsonBody.ok) {
      return Response.json(
        { error: "JSONの形式が不正です。" },
        { status: 400, headers: PRIVATE_NO_STORE_HEADERS },
      );
    }

    const body =
      typeof jsonBody.value === "object" && jsonBody.value !== null
        ? (jsonBody.value as ReportStatusRequest)
        : {};
    if (!isReportStatus(body.status)) {
      return Response.json(
        { error: "変更先の通報状態が不正です。" },
        { status: 400, headers: PRIVATE_NO_STORE_HEADERS },
      );
    }
    const note = typeof body.note === "string" ? body.note.trim() : "";
    if (!note || note.length > 500) {
      return Response.json(
        { error: "対応メモは1文字以上500文字以内で入力してください。" },
        { status: 400, headers: PRIVATE_NO_STORE_HEADERS },
      );
    }

    const { reportId } = await params;
    if (!reportId) {
      return Response.json(
        { error: "通報IDが不正です。" },
        { status: 400, headers: PRIVATE_NO_STORE_HEADERS },
      );
    }

    const nextStatus = body.status;
    const result = await prisma.$transaction(async (transaction) => {
      const report = await transaction.contentReport.findUnique({
        where: { id: reportId },
        select: { id: true, status: true },
      });
      if (!report) {
        return { error: "通報が見つかりません。", httpStatus: 404 } as const;
      }
      if (report.status === nextStatus) {
        return {
          error: "通報状態はすでに変更されています。",
          httpStatus: 409,
        } as const;
      }
      if (
        !allowedReportStatusTransitions[report.status].includes(nextStatus)
      ) {
        return {
          error: "完了した通報の状態は変更できません。",
          httpStatus: 409,
        } as const;
      }

      const reviewedAt = new Date();
      const updateResult = await transaction.contentReport.updateMany({
        where: { id: report.id, status: report.status },
        data: {
          status: nextStatus,
          reviewedByAdminUserId: authorization.admin.id,
          reviewedAt,
          reviewNote: note,
        },
      });
      if (updateResult.count !== 1) {
        return {
          error: "通報状態が更新されています。再読み込みしてください。",
          httpStatus: 409,
        } as const;
      }

      await transaction.contentReportStatusEvent.create({
        data: {
          reportId: report.id,
          adminUserId: authorization.admin.id,
          adminAuthId: authorization.admin.authId,
          adminRole: authorization.admin.role,
          previousStatus: report.status,
          newStatus: nextStatus,
          note,
          createdAt: reviewedAt,
        },
        select: { id: true },
      });

      return { success: true, status: nextStatus } as const;
    });

    if ("error" in result) {
      return Response.json(
        { error: result.error },
        { status: result.httpStatus, headers: PRIVATE_NO_STORE_HEADERS },
      );
    }
    return Response.json(result, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    console.error("Failed to update report status", error);
    return Response.json(
      { error: "通報状態を変更できませんでした。" },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS },
    );
  }
}
