import { authorizeAdminRequest } from "@/lib/adminAuth";
import { prisma } from "@/lib/prisma";
import { PRIVATE_NO_STORE_HEADERS } from "@/lib/httpCache";
import { readJsonBody } from "@/lib/requestJson";

const MAX_MODERATION_ACTION_BODY_BYTES = 16 * 1024;

type TargetType = "profile" | "audio" | "socialLink";
type ActionType = "hide" | "restore" | "suspend";

type ActionRequest = {
  targetType?: unknown;
  targetId?: unknown;
  action?: unknown;
  reason?: unknown;
};

const targetTypes: TargetType[] = ["profile", "audio", "socialLink"];
const actionTypes: ActionType[] = ["hide", "restore", "suspend"];

const isTargetType = (value: unknown): value is TargetType =>
  typeof value === "string" && targetTypes.includes(value as TargetType);

const isActionType = (value: unknown): value is ActionType =>
  typeof value === "string" && actionTypes.includes(value as ActionType);

function getNextStatus(targetType: TargetType, action: ActionType) {
  if (action === "restore") return "active";
  if (action === "hide") return "hidden";
  if (action === "suspend" && targetType === "profile") return "suspended";
  return null;
}

export async function PATCH(request: Request) {
  try {
    const authorization = await authorizeAdminRequest(request);
    if (!authorization.ok) return authorization.response;

    const jsonBody = await readJsonBody(
      request,
      MAX_MODERATION_ACTION_BODY_BYTES,
    );
    if (!jsonBody.ok) {
      return Response.json(
        {
          error:
            jsonBody.error === "too_large"
              ? "管理操作データは16KB以下にしてください。"
              : "JSONの形式が不正です。",
        },
        { status: jsonBody.error === "too_large" ? 413 : 400 },
      );
    }

    const body =
      typeof jsonBody.value === "object" && jsonBody.value !== null
        ? (jsonBody.value as ActionRequest)
        : {};
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    if (
      !isTargetType(body.targetType) ||
      typeof body.targetId !== "string" ||
      !body.targetId ||
      !isActionType(body.action) ||
      reason.length < 1 ||
      reason.length > 500
    ) {
      return Response.json(
        { error: "対象、操作、500文字以内の理由を指定してください。" },
        { status: 400 },
      );
    }

    const targetType = body.targetType;
    const targetId = body.targetId;
    const action = body.action;
    const nextStatus = getNextStatus(targetType, action);
    if (!nextStatus) {
      return Response.json({ error: "この操作は実行できません。" }, { status: 400 });
    }

    const result = await prisma.$transaction(async (tx) => {
      let profileId: string;
      let previousStatus: string;

      if (targetType === "profile") {
        const target = await tx.profile.findUnique({
          where: { id: targetId },
          select: { id: true, status: true },
        });
        if (!target) return { error: "対象が見つかりません。", status: 404 } as const;
        profileId = target.id;
        previousStatus = target.status;
        if (previousStatus === nextStatus) {
          return { error: "公開状態はすでに変更されています。", status: 409 } as const;
        }
        await tx.profile.update({
          where: { id: target.id },
          data: { status: nextStatus as "active" | "hidden" | "suspended" },
        });
      } else if (targetType === "audio") {
        const target = await tx.profile.findUnique({
          where: { id: targetId },
          select: { id: true, audioStatus: true },
        });
        if (!target) return { error: "対象が見つかりません。", status: 404 } as const;
        profileId = target.id;
        previousStatus = target.audioStatus;
        if (previousStatus === nextStatus) {
          return { error: "公開状態はすでに変更されています。", status: 409 } as const;
        }
        await tx.profile.update({
          where: { id: target.id },
          data: { audioStatus: nextStatus as "active" | "hidden" },
        });
      } else {
        const target = await tx.socialLink.findUnique({
          where: { id: targetId },
          select: { id: true, profileId: true, status: true },
        });
        if (!target) return { error: "対象が見つかりません。", status: 404 } as const;
        profileId = target.profileId;
        previousStatus = target.status;
        if (previousStatus === nextStatus) {
          return { error: "公開状態はすでに変更されています。", status: 409 } as const;
        }
        await tx.socialLink.update({
          where: { id: target.id },
          data: { status: nextStatus as "active" | "hidden" },
        });
      }

      await tx.moderationAction.create({
        data: {
          adminUserId: authorization.admin.id,
          profileId,
          targetType,
          targetId,
          action,
          previousStatus,
          newStatus: nextStatus,
          reason,
        },
      });

      return { previousStatus, newStatus: nextStatus } as const;
    });

    if ("error" in result) {
      return Response.json({ error: result.error }, { status: result.status });
    }

    return Response.json(
      { success: true, ...result },
      { headers: PRIVATE_NO_STORE_HEADERS },
    );
  } catch (error) {
    console.error("Failed to update moderation status", error);
    return Response.json(
      { error: "公開状態を変更できませんでした。" },
      { status: 500 },
    );
  }
}
