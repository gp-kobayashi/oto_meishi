import { beforeEach, describe, expect, it, vi } from "vitest";

const { mocks } = vi.hoisted(() => ({
  mocks: {
    authorizeAdminRequest: vi.fn(),
    findUnique: vi.fn(),
    historyFindMany: vi.fn(),
    reportGroupBy: vi.fn(),
  },
}));

vi.mock("@/lib/adminAuth", () => ({
  authorizeAdminRequest: mocks.authorizeAdminRequest,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    profile: { findUnique: mocks.findUnique },
    moderationAction: { findMany: mocks.historyFindMany },
    contentReport: { groupBy: mocks.reportGroupBy },
  },
}));

import { GET } from "@/app/(site)/api/admin/moderation/[profileId]/route";

const request = () =>
  new Request("http://localhost/api/admin/moderation/profile-1", {
    headers: { Authorization: "Bearer valid-token" },
  });

const context = (profileId = "profile-1") => ({
  params: Promise.resolve({ profileId }),
});

describe("GET /api/admin/moderation/[profileId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorizeAdminRequest.mockResolvedValue({
      ok: true,
      admin: { id: "admin-1", authId: "auth-1", role: "admin" },
    });
    mocks.findUnique.mockResolvedValue({
      id: "profile-1",
      userId: "sample-user",
      displayName: "サンプル",
      bio: "自己紹介",
      theme: "normal",
      status: "active",
      audioKey: "",
      audioUrl: "",
      audioTitle: "",
      audioStatus: "removed",
      createdAt: new Date("2026-07-16T00:00:00.000Z"),
      updatedAt: new Date("2026-07-17T00:00:00.000Z"),
      sns: [
        {
          id: "link-1",
          service: "youtube",
          label: "YouTube",
          url: "https://youtube.com/example",
          sortOrder: 0,
          status: "hidden",
        },
      ],
      reports: [
        {
          id: "report-1",
          targetType: "socialLink",
          targetId: "link-1",
          targetSnapshot: {
            service: "youtube",
            label: "YouTube",
            url: "https://youtube.com/example",
            status: "active",
          },
          moderationCase: null,
          moderationAction: null,
          reason: "unsafe_link",
          details: "外部サイトへ誘導される",
          status: "pending",
          reviewNote: "リンクを確認",
          reviewedAt: null,
          reviewedByAdminUser: null,
          statusEvents: [
            {
              id: "report-event-1",
              previousStatus: "pending",
              newStatus: "reviewed",
              note: "リンクを確認",
              isBackfilled: false,
              adminAuthId: "auth-admin-123456",
              adminRole: "admin",
              createdAt: new Date("2026-07-17T03:00:00.000Z"),
            },
          ],
          createdAt: new Date("2026-07-17T02:00:00.000Z"),
          updatedAt: new Date("2026-07-17T02:00:00.000Z"),
        },
      ],
      moderationRequests: [
        {
          id: "request-1",
          kind: "accountAppeal",
          status: "pending",
          message: "問題箇所を修正しました。",
          responseMessage: "",
          resolvedAt: null,
          createdAt: new Date("2026-07-17T05:00:00.000Z"),
          updatedAt: new Date("2026-07-17T05:00:00.000Z"),
        },
      ],
      identityVerificationRequests: [
        {
          id: "verification-1",
          moderationCaseId: "case-1",
          socialLinkId: "link-1",
          moderationCase: {
            id: "case-1",
            targetType: "profile",
            targetId: "profile-1",
            reasonCode: "impersonation",
            status: "preReviewPending",
            reviewMode: "preReview",
            userMessage: "なりすましの疑いがあるため本人確認が必要です。",
            resolvedAt: null,
          },
          socialLink: {
            id: "link-1",
            service: "x",
            label: "X",
            url: "https://x.com/sample",
            status: "hidden",
          },
          socialUrl: "https://x.com/sample",
          plannedContent: "確認用の投稿を行います。",
          status: "pending",
          postingDeadlineAt: new Date("2026-07-17T05:10:00.000Z"),
          reviewNote: "",
          reviewedAt: null,
          reviewedByAdminUser: null,
          createdAt: new Date("2026-07-17T05:00:00.000Z"),
          updatedAt: new Date("2026-07-17T05:00:00.000Z"),
        },
      ],
      moderationCases: [
        {
          id: "case-1",
          targetType: "audio",
          targetId: "profile-1",
          reasonCode: "inappropriateContent",
          status: "postReviewPending",
          reviewMode: "postReview",
          userMessage: "不適切な音声のため",
          reviewDueAt: new Date("2026-09-15T00:00:00.000Z"),
          retentionExpiresAt: new Date("2026-09-15T00:00:00.000Z"),
          resolvedAt: null,
          createdAt: new Date("2026-07-17T01:00:00.000Z"),
          updatedAt: new Date("2026-07-17T04:00:00.000Z"),
          snapshots: [
            {
              id: "snapshot-1",
              kind: "reported",
              content: {
                audioTitle: "削除前の音声",
                audioStatus: "hidden",
              },
              contentHash: "old-hash",
              storageObjectKey: "audio/old.mp3",
              expiresAt: new Date("2026-09-15T00:00:00.000Z"),
              createdAt: new Date("2026-07-17T01:00:00.000Z"),
            },
          ],
          events: [
            {
              id: "event-1",
              eventType: "contentDeleted",
              actorType: "user",
              actorId: "auth-user-123456",
              previousStatus: "correctionRequired",
              newStatus: "postReviewPending",
              details: { targetType: "audio" },
              createdAt: new Date("2026-07-17T04:00:00.000Z"),
            },
          ],
        },
      ],
      violationEvents: [
        {
          id: "violation-1",
          moderationCaseId: "case-1",
          eventType: "confirmed",
          reasonCode: "inappropriateContent",
          originalViolationEventId: null,
          suspensionTriggered: true,
          note: "不適切な音声のため",
          adminAuthId: "auth-admin-123456",
          adminRole: "admin",
          createdAt: new Date("2026-07-17T01:00:00.000Z"),
        },
        {
          id: "revocation-1",
          moderationCaseId: "case-1",
          eventType: "revoked",
          reasonCode: "inappropriateContent",
          originalViolationEventId: "violation-1",
          suspensionTriggered: false,
          note: "確認の結果、違反回数を取り消し",
          adminAuthId: "auth-admin-654321",
          adminRole: "admin",
          createdAt: new Date("2026-07-18T01:00:00.000Z"),
        },
        {
          id: "violation-2",
          moderationCaseId: "case-2",
          eventType: "confirmed",
          reasonCode: "unsafeLink",
          originalViolationEventId: null,
          suspensionTriggered: false,
          note: "危険なリンクのため",
          adminAuthId: null,
          adminRole: null,
          createdAt: new Date("2026-07-19T01:00:00.000Z"),
        },
      ],
    });
    mocks.historyFindMany.mockResolvedValue([
      {
        id: "action-1",
        targetType: "socialLink",
        targetId: "link-1",
        action: "hide",
        actorType: "admin",
        previousStatus: "active",
        newStatus: "hidden",
        reason: "危険なリンクのため",
        createdAt: new Date("2026-07-17T01:00:00.000Z"),
        adminUser: { authId: "auth-admin-123456", role: "admin" },
      },
      {
        id: "action-system-1",
        targetType: "profile",
        targetId: "profile-1",
        action: "scheduleDeletion",
        actorType: "system",
        previousStatus: "suspended",
        newStatus: "deletionPending",
        reason: "利用停止後60日間、解除申請がなかったため",
        createdAt: new Date("2026-07-18T01:00:00.000Z"),
        adminUser: null,
      },
    ]);
    mocks.reportGroupBy.mockResolvedValue([
      { targetType: "socialLink", targetId: "link-1", _count: { _all: 51 } },
    ]);
  });

  it("プロフィール・音声・リンクの詳細を返す", async () => {
    const response = await GET(request(), context());
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(result.profile).toMatchObject({
      id: "profile-1",
      userId: "sample-user",
      hasAudio: false,
      audioStatus: "removed",
      deletedAudio: {
        moderationCaseId: "case-1",
        status: "postReviewPending",
        reviewMode: "postReview",
        reviewDueAt: "2026-09-15T00:00:00.000Z",
        previousTitle: "削除前の音声",
        previousStatus: "hidden",
        deletedAt: "2026-07-17T04:00:00.000Z",
        deletedByType: "user",
        deletedByIdentifier: "auth-use",
      },
      createdAt: "2026-07-16T00:00:00.000Z",
      links: [{ id: "link-1", status: "hidden" }],
      reports: [
        {
          id: "report-1",
          reason: "unsafe_link",
          status: "pending",
          reviewNote: "リンクを確認",
          reviewerIdentifier: null,
          reviewerRole: null,
          reviewedAt: null,
          createdAt: "2026-07-17T02:00:00.000Z",
          statusEvents: [
            {
              id: "report-event-1",
              previousStatus: "pending",
              newStatus: "reviewed",
              note: "リンクを確認",
              isBackfilled: false,
              adminIdentifier: "auth-adm",
              adminRole: "admin",
              createdAt: "2026-07-17T03:00:00.000Z",
            },
          ],
        },
      ],
      moderationRequests: [
        {
          id: "request-1",
          kind: "accountAppeal",
          status: "pending",
          message: "問題箇所を修正しました。",
          responseMessage: "",
          resolvedAt: null,
          createdAt: "2026-07-17T05:00:00.000Z",
          updatedAt: "2026-07-17T05:00:00.000Z",
        },
      ],
      identityVerificationRequests: [
        {
          id: "verification-1",
          moderationCaseId: "case-1",
          socialLinkId: "link-1",
          moderationCase: {
            id: "case-1",
            targetType: "profile",
            targetId: "profile-1",
            reasonCode: "impersonation",
            status: "preReviewPending",
            reviewMode: "preReview",
            userMessage: "なりすましの疑いがあるため本人確認が必要です。",
            resolvedAt: null,
          },
          socialLink: {
            id: "link-1",
            service: "x",
            label: "X",
            url: "https://x.com/sample",
            status: "hidden",
          },
          socialUrl: "https://x.com/sample",
          plannedContent: "確認用の投稿を行います。",
          status: "pending",
          postingDeadlineAt: "2026-07-17T05:10:00.000Z",
          reviewNote: "",
          reviewerIdentifier: null,
          reviewerRole: null,
          reviewedAt: null,
          createdAt: "2026-07-17T05:00:00.000Z",
          updatedAt: "2026-07-17T05:00:00.000Z",
        },
      ],
      moderationCases: [
        {
          id: "case-1",
          targetType: "audio",
          targetId: "profile-1",
          reasonCode: "inappropriateContent",
          status: "postReviewPending",
          reviewMode: "postReview",
          userMessage: "不適切な音声のため",
          snapshots: [
            {
              id: "snapshot-1",
              kind: "reported",
              content: {
                audioTitle: "削除前の音声",
                audioStatus: "hidden",
              },
            },
          ],
          events: [
            {
              id: "event-1",
              eventType: "contentDeleted",
              actorType: "user",
              actorIdentifier: "auth-use",
              previousStatus: "correctionRequired",
              newStatus: "postReviewPending",
              createdAt: "2026-07-17T04:00:00.000Z",
            },
          ],
        },
      ],
      violationSummary: {
        activeCount: 1,
        countsByReason: { unsafeLink: 1 },
      },
      violationEvents: [
        {
          id: "violation-1",
          eventType: "confirmed",
          reasonCode: "inappropriateContent",
          suspensionTriggered: true,
          isActive: false,
          adminIdentifier: "auth-adm",
          createdAt: "2026-07-17T01:00:00.000Z",
        },
        {
          id: "revocation-1",
          eventType: "revoked",
          reasonCode: "inappropriateContent",
          originalViolationEventId: "violation-1",
          isActive: false,
          adminIdentifier: "auth-adm",
          createdAt: "2026-07-18T01:00:00.000Z",
        },
        {
          id: "violation-2",
          eventType: "confirmed",
          reasonCode: "unsafeLink",
          suspensionTriggered: false,
          isActive: true,
          adminIdentifier: null,
          createdAt: "2026-07-19T01:00:00.000Z",
        },
      ],
      history: [
        {
          id: "action-1",
          actorType: "admin",
          adminIdentifier: "auth-adm",
          reason: "危険なリンクのため",
        },
        {
          id: "action-system-1",
          action: "scheduleDeletion",
          actorType: "system",
          adminIdentifier: null,
          adminRole: null,
        },
      ],
    });
    expect(result.profile.audioUrl).toBeUndefined();
  });

  it("プロフィールが存在しない場合は404を返す", async () => {
    mocks.findUnique.mockResolvedValue(null);

    const response = await GET(request(), context("missing"));

    expect(response.status).toBe(404);
  });

  it("権限がない場合はDBへ問い合わせない", async () => {
    mocks.authorizeAdminRequest.mockResolvedValue({
      ok: false,
      response: Response.json({ error: "権限なし" }, { status: 403 }),
    });

    const response = await GET(request(), context());

    expect(response.status).toBe(403);
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });
});
