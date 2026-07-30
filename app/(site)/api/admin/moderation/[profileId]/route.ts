import { authorizeAdminRequest } from "@/lib/adminAuth";
import { prisma } from "@/lib/prisma";
import { PRIVATE_NO_STORE_HEADERS } from "@/lib/httpCache";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ profileId: string }> },
) {
  try {
    const authorization = await authorizeAdminRequest(request);
    if (!authorization.ok) return authorization.response;

    const { profileId } = await params;
    if (!profileId) {
      return Response.json({ error: "プロフィールIDが不正です。" }, { status: 400 });
    }

    const profile = await prisma.profile.findUnique({
      where: { id: profileId },
      select: {
        id: true,
        userId: true,
        displayName: true,
        bio: true,
        theme: true,
        status: true,
        audioKey: true,
        audioUrl: true,
        audioTitle: true,
        audioStatus: true,
        createdAt: true,
        updatedAt: true,
        sns: {
          orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
          select: {
            id: true,
            service: true,
            label: true,
            url: true,
            sortOrder: true,
            status: true,
          },
        },
        reports: {
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: 50,
          select: {
            id: true,
            reason: true,
            details: true,
            status: true,
            reviewNote: true,
            reviewedAt: true,
            reviewedByAdminUser: {
              select: { authId: true, role: true },
            },
            createdAt: true,
            updatedAt: true,
          },
        },
        moderationCases: {
          where: { targetType: "audio" },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: 1,
          select: {
            id: true,
            status: true,
            reviewMode: true,
            reviewDueAt: true,
            snapshots: {
              where: { kind: "reported" },
              orderBy: [{ createdAt: "desc" }, { id: "desc" }],
              take: 1,
              select: { content: true },
            },
            events: {
              where: { eventType: "contentDeleted" },
              orderBy: [{ createdAt: "desc" }, { id: "desc" }],
              take: 1,
              select: {
                actorType: true,
                actorId: true,
                createdAt: true,
              },
            },
          },
        },
      },
    });

    if (!profile) {
      return Response.json(
        { error: "プロフィールが見つかりません。" },
        { status: 404 },
      );
    }

    const history = await prisma.moderationAction.findMany({
      where: { profileId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 50,
      select: {
        id: true,
        targetType: true,
        targetId: true,
        action: true,
        previousStatus: true,
        newStatus: true,
        reason: true,
        createdAt: true,
        adminUser: { select: { authId: true, role: true } },
      },
    });
    const deletedAudioCase = profile.moderationCases[0];
    const deletedAudioEvent = deletedAudioCase?.events[0];
    const reportedAudio = deletedAudioCase?.snapshots[0]?.content;

    return Response.json(
      {
        profile: {
          id: profile.id,
          userId: profile.userId,
          displayName: profile.displayName,
          bio: profile.bio,
          theme: profile.theme,
          status: profile.status,
          hasAudio: Boolean(profile.audioKey || profile.audioUrl),
          audioTitle: profile.audioTitle,
          audioStatus: profile.audioStatus,
          deletedAudio:
            deletedAudioCase && deletedAudioEvent
              ? {
                  moderationCaseId: deletedAudioCase.id,
                  status: deletedAudioCase.status,
                  reviewMode: deletedAudioCase.reviewMode,
                  reviewDueAt: deletedAudioCase.reviewDueAt.toISOString(),
                  previousTitle: getSnapshotString(
                    reportedAudio,
                    "audioTitle",
                  ),
                  previousStatus: getSnapshotString(
                    reportedAudio,
                    "audioStatus",
                  ),
                  deletedAt: deletedAudioEvent?.createdAt.toISOString() ?? null,
                  deletedByType: deletedAudioEvent?.actorType ?? null,
                  deletedByIdentifier:
                    deletedAudioEvent?.actorId?.slice(0, 8) ?? null,
                }
              : null,
          createdAt: profile.createdAt.toISOString(),
          updatedAt: profile.updatedAt.toISOString(),
          links: profile.sns,
          reports: profile.reports.map((report) => ({
            id: report.id,
            reason: report.reason,
            details: report.details,
            status: report.status,
            reviewNote: report.reviewNote,
            reviewerIdentifier:
              report.reviewedByAdminUser?.authId.slice(0, 8) ?? null,
            reviewerRole: report.reviewedByAdminUser?.role ?? null,
            reviewedAt: report.reviewedAt?.toISOString() ?? null,
            createdAt: report.createdAt.toISOString(),
            updatedAt: report.updatedAt.toISOString(),
          })),
          history: history.map((entry) => ({
            id: entry.id,
            targetType: entry.targetType,
            targetId: entry.targetId,
            action: entry.action,
            previousStatus: entry.previousStatus,
            newStatus: entry.newStatus,
            reason: entry.reason,
            adminIdentifier: entry.adminUser.authId.slice(0, 8),
            adminRole: entry.adminUser.role,
            createdAt: entry.createdAt.toISOString(),
          })),
        },
      },
      { headers: PRIVATE_NO_STORE_HEADERS },
    );
  } catch (error) {
    console.error("Failed to load moderation detail", error);
    return Response.json(
      { error: "管理対象の詳細を取得できませんでした。" },
      { status: 500 },
    );
  }
}

function getSnapshotString(
  content: unknown,
  key: string,
): string | null {
  if (
    typeof content !== "object" ||
    content === null ||
    Array.isArray(content)
  ) {
    return null;
  }

  const value = (content as Record<string, unknown>)[key];
  return typeof value === "string" ? value : null;
}
