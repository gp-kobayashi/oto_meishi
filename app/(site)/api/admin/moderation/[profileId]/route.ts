import { authorizeAdminRequest } from "@/lib/adminAuth";
import { prisma } from "@/lib/prisma";
import { PRIVATE_NO_STORE_HEADERS } from "@/lib/httpCache";
import { getActiveViolationEvents } from "@/lib/moderationViolation";
import {
  mergeUnresolvedWithRecentHistory,
  unresolvedReportStatuses,
} from "@/lib/adminModeration";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ profileId: string }> },
) {
  try {
    const authorization = await authorizeAdminRequest(request);
    if (!authorization.ok) return authorization.response;

    const { profileId } = await params;
    if (!profileId) {
      return Response.json(
        { error: "プロフィールIDが不正です。" },
        { status: 400 },
      );
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
            targetType: true,
            targetId: true,
            targetSnapshot: true,
            moderationCase: {
              select: { id: true, status: true, reasonCode: true },
            },
            moderationAction: {
              select: { id: true, action: true, createdAt: true },
            },
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
            moderationCase: {
              select: {
                id: true,
                targetType: true,
                targetId: true,
                reasonCode: true,
                status: true,
                reviewMode: true,
                userMessage: true,
                resolvedAt: true,
              },
            },
            socialLink: {
              select: {
                id: true,
                service: true,
                label: true,
                url: true,
                status: true,
              },
            },
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

    const [
      unresolvedReports,
      unresolvedRequests,
      unresolvedVerifications,
      unresolvedCases,
    ] = await Promise.all([
      prisma.contentReport.findMany({
        where: { profileId, status: { in: unresolvedReportStatuses } },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: {
          id: true,
          targetType: true,
          targetId: true,
          targetSnapshot: true,
          moderationCase: {
            select: { id: true, status: true, reasonCode: true },
          },
          moderationAction: {
            select: { id: true, action: true, createdAt: true },
          },
          reason: true,
          details: true,
          status: true,
          reviewNote: true,
          reviewedAt: true,
          reviewedByAdminUser: { select: { authId: true, role: true } },
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
      }),
      prisma.moderationRequest.findMany({
        where: { profileId, status: "pending" },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
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
      prisma.identityVerificationRequest.findMany({
        where: { profileId, status: "pending" },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: {
          id: true,
          moderationCaseId: true,
          socialLinkId: true,
          moderationCase: {
            select: {
              id: true,
              targetType: true,
              targetId: true,
              reasonCode: true,
              status: true,
              reviewMode: true,
              userMessage: true,
              resolvedAt: true,
            },
          },
          socialLink: {
            select: {
              id: true,
              service: true,
              label: true,
              url: true,
              status: true,
            },
          },
          socialUrl: true,
          plannedContent: true,
          status: true,
          postingDeadlineAt: true,
          reviewNote: true,
          reviewedAt: true,
          reviewedByAdminUser: { select: { authId: true, role: true } },
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.moderationCase.findMany({
        where: {
          profileId,
          status: {
            in: ["correctionRequired", "postReviewPending", "preReviewPending"],
          },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
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
      }),
    ]);

    const reports = [...profile.reports, ...unresolvedReports];
    const moderationRequests = [
      ...profile.moderationRequests,
      ...unresolvedRequests,
    ];
    const identityVerificationRequests = [
      ...profile.identityVerificationRequests,
      ...unresolvedVerifications,
    ];
    const moderationCases = [...profile.moderationCases, ...unresolvedCases];

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
    const reportTargetCounts = await prisma.contentReport.groupBy({
      by: ["targetType", "targetId"],
      where: { profileId },
      _count: { _all: true },
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
    const reportTargetCountMap = new Map(
      reportTargetCounts.map((entry) => [
        `${entry.targetType}:${entry.targetId}`,
        entry._count._all,
      ]),
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
                  previousTitle: getSnapshotString(reportedAudio, "audioTitle"),
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
          reports: mergeUnresolvedWithRecentHistory(
            reports,
            unresolvedReportStatuses,
          ).map((report) => ({
            id: report.id,
            targetType: report.targetType,
            targetId: report.targetId,
            target: getReportTarget(
              report.targetType,
              report.targetId,
              report.targetSnapshot,
              profile,
            ),
            sameTargetReportCount:
              reportTargetCountMap.get(
                `${report.targetType}:${report.targetId}`,
              ) ?? 1,
            moderationCase: report.moderationCase
              ? {
                  id: report.moderationCase.id,
                  status: report.moderationCase.status,
                  reasonCode: report.moderationCase.reasonCode,
                }
              : null,
            moderationAction: report.moderationAction
              ? {
                  id: report.moderationAction.id,
                  action: report.moderationAction.action,
                  createdAt: report.moderationAction.createdAt.toISOString(),
                }
              : null,
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
          moderationRequests: mergeUnresolvedWithRecentHistory(
            moderationRequests,
            ["pending"],
          ).map((moderationRequest) => ({
            ...moderationRequest,
            resolvedAt: moderationRequest.resolvedAt?.toISOString() ?? null,
            createdAt: moderationRequest.createdAt.toISOString(),
            updatedAt: moderationRequest.updatedAt.toISOString(),
          })),
          identityVerificationRequests: mergeUnresolvedWithRecentHistory(
            identityVerificationRequests,
            ["pending"],
          ).map((verificationRequest) => ({
            id: verificationRequest.id,
            moderationCaseId: verificationRequest.moderationCaseId,
            socialLinkId: verificationRequest.socialLinkId,
            moderationCase: {
              ...verificationRequest.moderationCase,
              resolvedAt:
                verificationRequest.moderationCase.resolvedAt?.toISOString() ??
                null,
            },
            socialLink: verificationRequest.socialLink,
            socialUrl: verificationRequest.socialUrl,
            plannedContent: verificationRequest.plannedContent,
            status: verificationRequest.status,
            postingDeadlineAt:
              verificationRequest.postingDeadlineAt.toISOString(),
            reviewNote: verificationRequest.reviewNote,
            reviewerIdentifier:
              verificationRequest.reviewedByAdminUser?.authId.slice(0, 8) ??
              null,
            reviewerRole: verificationRequest.reviewedByAdminUser?.role ?? null,
            reviewedAt: verificationRequest.reviewedAt?.toISOString() ?? null,
            createdAt: verificationRequest.createdAt.toISOString(),
            updatedAt: verificationRequest.updatedAt.toISOString(),
          })),
          moderationCases: mergeUnresolvedWithRecentHistory(moderationCases, [
            "correctionRequired",
            "postReviewPending",
            "preReviewPending",
          ]).map((moderationCase) => ({
            id: moderationCase.id,
            targetType: moderationCase.targetType,
            targetId: moderationCase.targetId,
            reasonCode: moderationCase.reasonCode,
            status: moderationCase.status,
            reviewMode: moderationCase.reviewMode,
            userMessage: moderationCase.userMessage,
            reviewDueAt: moderationCase.reviewDueAt.toISOString(),
            retentionExpiresAt: moderationCase.retentionExpiresAt.toISOString(),
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

function getSnapshotString(content: unknown, key: string): string | null {
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

function getReportTarget(
  targetType: "profile" | "audio" | "socialLink",
  targetId: string,
  snapshot: unknown,
  profile: {
    id: string;
    displayName: string;
    bio: string;
    theme: string;
    status: string;
    audioTitle: string;
    audioStatus: string;
    audioKey: string;
    audioUrl: string;
    sns: Array<{
      id: string;
      service: string;
      label: string;
      url: string;
      status: string;
    }>;
  },
) {
  const snapshotValues = getReportSnapshotValues(snapshot, targetType);
  if (targetType === "profile") {
    return {
      targetLabel: `プロフィール（${profile.displayName}）`,
      targetUrl: null,
      snapshot: snapshotValues,
      current: getLabeledValues(
        {
          displayName: profile.displayName,
          bio: profile.bio,
          theme: profile.theme,
          status: profile.status,
        },
        targetType,
      ),
      snapshotAvailable: snapshotValues !== null,
    };
  }
  if (targetType === "audio") {
    const hasAudio = Boolean(profile.audioKey || profile.audioUrl);
    return {
      targetLabel: `音声（${profile.audioTitle || "タイトルなし"}）`,
      targetUrl: null,
      snapshot: snapshotValues,
      current: getLabeledValues(
        {
          audioTitle: profile.audioTitle,
          audioStatus: profile.audioStatus,
          hasAudio: String(hasAudio),
        },
        targetType,
      ),
      snapshotAvailable: snapshotValues !== null,
    };
  }
  const link = profile.sns.find((item) => item.id === targetId);
  return {
    targetLabel: link
      ? `${link.label}（${link.service}）`
      : "リンク（削除済み）",
    targetUrl: link && isSafeExternalUrl(link.url) ? link.url : null,
    snapshot: snapshotValues,
    current: link
      ? getLabeledValues(
          {
            service: link.service,
            label: link.label,
            url: link.url,
            status: link.status,
          },
          targetType,
        )
      : null,
    snapshotAvailable: snapshotValues !== null,
  };
}

function getLabeledValues(
  values: Record<string, string>,
  targetType: "profile" | "audio" | "socialLink",
): Record<string, string> {
  const labels: Record<string, string> = {
    displayName: "表示名",
    bio: "自己紹介",
    theme: "テーマ",
    status: "状態",
    audioTitle: "音声タイトル",
    audioStatus: "音声状態",
    hasAudio: "音声有無",
    service: "サービス",
    label: "ラベル",
    url: "URL",
  };
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => [
      labels[key] ?? `${targetType}の${key}`,
      value,
    ]),
  );
}

function getReportSnapshotValues(
  content: unknown,
  targetType: "profile" | "audio" | "socialLink",
): Record<string, string> | null {
  if (
    typeof content !== "object" ||
    content === null ||
    Array.isArray(content)
  ) {
    return null;
  }
  const raw = content as Record<string, unknown>;
  if (raw.source === "legacy" && raw.available === false) return null;
  const labels: Record<string, string> = {
    displayName: "表示名",
    bio: "自己紹介",
    theme: "テーマ",
    status: "状態",
    audioTitle: "音声タイトル",
    audioStatus: "音声状態",
    hasAudio: "音声有無",
    service: "サービス",
    label: "ラベル",
    url: "URL",
  };
  const values: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (key === "source" || key === "available" || key === "reason") {
      continue;
    }
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      values[labels[key] ?? `${targetType}の${key}`] = String(value);
    }
  }
  return Object.keys(values).length ? values : null;
}

function isSafeExternalUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}
