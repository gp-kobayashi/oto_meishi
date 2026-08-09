import { authorizeAdminRequest } from "@/lib/adminAuth";
import { prisma } from "@/lib/prisma";
import { PRIVATE_NO_STORE_HEADERS } from "@/lib/httpCache";
import { getActiveViolationEvents } from "@/lib/moderationViolation";

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
            statusEvents: {
              orderBy: [{ createdAt: "asc" }, { id: "asc" }],
              take: 50,
              select: {
                id: true,
                previousStatus: true,
                newStatus: true,
                note: true,
                isBackfilled: true,
                adminAuthId: true,
                adminRole: true,
                createdAt: true,
              },
            },
            createdAt: true,
            updatedAt: true,
          },
        },
        moderationRequests: {
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: 50,
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
        },
        identityVerificationRequests: {
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: 50,
          select: {
            id: true,
            moderationCaseId: true,
            socialLinkId: true,
            socialUrl: true,
            plannedContent: true,
            status: true,
            postingDeadlineAt: true,
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
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: 50,
          select: {
            id: true,
            targetType: true,
            targetId: true,
            reasonCode: true,
            status: true,
            reviewMode: true,
            userMessage: true,
            reviewDueAt: true,
            retentionExpiresAt: true,
            resolvedAt: true,
            createdAt: true,
            updatedAt: true,
            snapshots: {
              orderBy: [{ createdAt: "asc" }, { id: "asc" }],
              select: {
                id: true,
                kind: true,
                content: true,
                contentHash: true,
                storageObjectKey: true,
                expiresAt: true,
                createdAt: true,
              },
            },
            events: {
              orderBy: [{ createdAt: "asc" }, { id: "asc" }],
              select: {
                id: true,
                eventType: true,
                actorType: true,
                actorId: true,
                previousStatus: true,
                newStatus: true,
                details: true,
                createdAt: true,
              },
            },
          },
        },
        violationEvents: {
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          select: {
            id: true,
            moderationCaseId: true,
            eventType: true,
            reasonCode: true,
            originalViolationEventId: true,
            suspensionTriggered: true,
            note: true,
            adminAuthId: true,
            adminRole: true,
            createdAt: true,
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
        actorType: true,
        previousStatus: true,
        newStatus: true,
        reason: true,
        createdAt: true,
        adminUser: { select: { authId: true, role: true } },
      },
    });
    const deletedAudioCase = profile.moderationCases.find(
      (moderationCase) =>
        moderationCase.targetType === "audio" &&
        moderationCase.events.some(
          (event) => event.eventType === "contentDeleted",
        ),
    );
    const deletedAudioEvent = deletedAudioCase?.events.findLast(
      (event) => event.eventType === "contentDeleted",
    );
    const reportedAudio = deletedAudioCase?.snapshots.findLast(
      (snapshot) => snapshot.kind === "reported",
    )?.content;
    const activeViolationEvents = getActiveViolationEvents(
      profile.violationEvents,
    );
    const activeViolationIds = new Set(
      activeViolationEvents.map((event) => event.id),
    );
    const countsByReason = activeViolationEvents.reduce<Record<string, number>>(
      (counts, event) => {
        counts[event.reasonCode] = (counts[event.reasonCode] ?? 0) + 1;
        return counts;
      },
      {},
    );

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
            statusEvents: report.statusEvents.map((event) => ({
              id: event.id,
              previousStatus: event.previousStatus,
              newStatus: event.newStatus,
              note: event.note,
              isBackfilled: event.isBackfilled,
              adminIdentifier: event.adminAuthId?.slice(0, 8) ?? null,
              adminRole: event.adminRole,
              createdAt: event.createdAt.toISOString(),
            })),
          })),
          moderationRequests: profile.moderationRequests.map(
            (moderationRequest) => ({
              ...moderationRequest,
              resolvedAt:
                moderationRequest.resolvedAt?.toISOString() ?? null,
              createdAt: moderationRequest.createdAt.toISOString(),
              updatedAt: moderationRequest.updatedAt.toISOString(),
            }),
          ),
          identityVerificationRequests:
            profile.identityVerificationRequests.map(
              (verificationRequest) => ({
                id: verificationRequest.id,
                moderationCaseId: verificationRequest.moderationCaseId,
                socialLinkId: verificationRequest.socialLinkId,
                socialUrl: verificationRequest.socialUrl,
                plannedContent: verificationRequest.plannedContent,
                status: verificationRequest.status,
                postingDeadlineAt:
                  verificationRequest.postingDeadlineAt.toISOString(),
                reviewNote: verificationRequest.reviewNote,
                reviewerIdentifier:
                  verificationRequest.reviewedByAdminUser?.authId.slice(0, 8) ??
                  null,
                reviewerRole:
                  verificationRequest.reviewedByAdminUser?.role ?? null,
                reviewedAt:
                  verificationRequest.reviewedAt?.toISOString() ?? null,
                createdAt: verificationRequest.createdAt.toISOString(),
                updatedAt: verificationRequest.updatedAt.toISOString(),
              }),
            ),
          moderationCases: profile.moderationCases.map((moderationCase) => ({
            id: moderationCase.id,
            targetType: moderationCase.targetType,
            targetId: moderationCase.targetId,
            reasonCode: moderationCase.reasonCode,
            status: moderationCase.status,
            reviewMode: moderationCase.reviewMode,
            userMessage: moderationCase.userMessage,
            reviewDueAt: moderationCase.reviewDueAt.toISOString(),
            retentionExpiresAt:
              moderationCase.retentionExpiresAt.toISOString(),
            resolvedAt: moderationCase.resolvedAt?.toISOString() ?? null,
            createdAt: moderationCase.createdAt.toISOString(),
            updatedAt: moderationCase.updatedAt.toISOString(),
            snapshots: moderationCase.snapshots.map((snapshot) => ({
              id: snapshot.id,
              kind: snapshot.kind,
              content: snapshot.content,
              contentHash: snapshot.contentHash,
              hasStoredAudio: Boolean(snapshot.storageObjectKey),
              expiresAt: snapshot.expiresAt.toISOString(),
              createdAt: snapshot.createdAt.toISOString(),
            })),
            events: moderationCase.events.map((event) => ({
              ...event,
              actorIdentifier: event.actorId?.slice(0, 8) ?? null,
              actorId: undefined,
              createdAt: event.createdAt.toISOString(),
            })),
          })),
          violationSummary: {
            activeCount: activeViolationEvents.length,
            countsByReason,
          },
          violationEvents: profile.violationEvents.map((event) => ({
            id: event.id,
            moderationCaseId: event.moderationCaseId,
            eventType: event.eventType,
            reasonCode: event.reasonCode,
            originalViolationEventId: event.originalViolationEventId,
            suspensionTriggered: event.suspensionTriggered,
            note: event.note,
            isActive: activeViolationIds.has(event.id),
            adminIdentifier: event.adminAuthId?.slice(0, 8) ?? null,
            adminRole: event.adminRole,
            createdAt: event.createdAt.toISOString(),
          })),
          history: history.map((entry) => ({
            id: entry.id,
            targetType: entry.targetType,
            targetId: entry.targetId,
            action: entry.action,
            actorType: entry.actorType,
            previousStatus: entry.previousStatus,
            newStatus: entry.newStatus,
            reason: entry.reason,
            adminIdentifier: entry.adminUser?.authId.slice(0, 8) ?? null,
            adminRole: entry.adminUser?.role ?? null,
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
