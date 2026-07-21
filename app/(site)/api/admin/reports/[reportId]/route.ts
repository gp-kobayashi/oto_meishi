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
type ReportStatusRequest = { status?: unknown };

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

    const { reportId } = await params;
    if (!reportId) {
      return Response.json(
        { error: "通報IDが不正です。" },
        { status: 400, headers: PRIVATE_NO_STORE_HEADERS },
      );
    }

    const report = await prisma.contentReport.findUnique({
      where: { id: reportId },
      select: { id: true, status: true },
    });
    if (!report) {
      return Response.json(
        { error: "通報が見つかりません。" },
        { status: 404, headers: PRIVATE_NO_STORE_HEADERS },
      );
    }
    if (report.status === body.status) {
      return Response.json(
        { error: "通報状態はすでに変更されています。" },
        { status: 409, headers: PRIVATE_NO_STORE_HEADERS },
      );
    }

    await prisma.contentReport.update({
      where: { id: report.id },
      data: { status: body.status },
      select: { id: true },
    });

    return Response.json(
      { success: true, status: body.status },
      { headers: PRIVATE_NO_STORE_HEADERS },
    );
  } catch (error) {
    console.error("Failed to update report status", error);
    return Response.json(
      { error: "通報状態を変更できませんでした。" },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS },
    );
  }
}
