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

const MAX_VIOLATION_REVOCATION_BODY_BYTES = 4 * 1024;

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ violationId: string }> },
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

    const jsonBody = await readJsonBody(
      request,
      MAX_VIOLATION_REVOCATION_BODY_BYTES,
    );
    if (!jsonBody.ok) {
      return Response.json(
        { error: "JSONの形式が不正です。" },
        { status: 400, headers: PRIVATE_NO_STORE_HEADERS },
      );
    }

    const body =
      typeof jsonBody.value === "object" && jsonBody.value !== null
        ? (jsonBody.value as { note?: unknown })
        : {};
    const note = typeof body.note === "string" ? body.note.trim() : "";
    if (!note || note.length > 500) {
      return Response.json(
        { error: "取り消し理由は1文字以上500文字以内で入力してください。" },
        { status: 400, headers: PRIVATE_NO_STORE_HEADERS },
      );
    }

    const { violationId } = await params;
    if (!violationId) {
      return Response.json(
        { error: "違反履歴IDが不正です。" },
        { status: 400, headers: PRIVATE_NO_STORE_HEADERS },
      );
    }

    const result = await prisma.$transaction(async (transaction) => {
      await transaction.$queryRawUnsafe(
        "select pg_advisory_xact_lock(hashtextextended($1, 0))",
        violationId,
      );
      const violation = await transaction.moderationViolationEvent.findUnique({
        where: { id: violationId },
        select: {
          id: true,
          profileId: true,
          moderationCaseId: true,
          eventType: true,
          reasonCode: true,
        },
      });
      if (!violation || violation.eventType !== "confirmed") {
        return { error: "取り消し対象の違反が見つかりません。", status: 404 } as const;
      }
      if (violation.reasonCode !== "impersonation") {
        return {
          error: "本人確認による取り消しはなりすまし事案のみ対象です。",
          status: 409,
        } as const;
      }

      const existingRevocation =
        await transaction.moderationViolationEvent.findFirst({
          where: {
            eventType: "revoked",
            originalViolationEventId: violation.id,
          },
          select: { id: true },
        });
      if (existingRevocation) {
        return { error: "この違反回数はすでに取り消されています。", status: 409 } as const;
      }

      const revocation = await transaction.moderationViolationEvent.create({
        data: {
          profileId: violation.profileId,
          moderationCaseId: violation.moderationCaseId,
          adminUserId: authorization.admin.id,
          adminAuthId: authorization.admin.authId,
          adminRole: authorization.admin.role,
          eventType: "revoked",
          reasonCode: violation.reasonCode,
          originalViolationEventId: violation.id,
          suspensionTriggered: false,
          note,
        },
        select: { id: true },
      });

      return { success: true, revocationId: revocation.id } as const;
    });

    if ("error" in result) {
      return Response.json(
        { error: result.error },
        { status: result.status, headers: PRIVATE_NO_STORE_HEADERS },
      );
    }
    return Response.json(result, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    console.error("Failed to revoke moderation violation", error);
    return Response.json(
      { error: "違反回数を取り消せませんでした。" },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS },
    );
  }
}
