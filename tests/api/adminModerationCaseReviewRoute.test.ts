import { beforeEach, describe, expect, it, vi } from "vitest";

const { mocks } = vi.hoisted(() => ({
  mocks: {
    authorize: vi.fn(),
    transaction: vi.fn(),
    caseFindUnique: vi.fn(),
    caseUpdate: vi.fn(),
    eventCreate: vi.fn(),
    profileUpdate: vi.fn(),
    linkFindUnique: vi.fn(),
    linkUpdateMany: vi.fn(),
    actionCreate: vi.fn(),
    notificationCreate: vi.fn(),
    userRateLimit: vi.fn(),
    ipRateLimit: vi.fn(),
    getClientIp: vi.fn(),
  },
}));

vi.mock("@/lib/adminAuth", () => ({
  authorizeAdminRequest: mocks.authorize,
}));
vi.mock("@/lib/adminActionRateLimit", () => ({
  consumeAdminActionRateLimit: mocks.userRateLimit,
  consumeAdminActionIpRateLimit: mocks.ipRateLimit,
}));
vi.mock("@/lib/clientIp", () => ({ getClientIp: mocks.getClientIp }));
vi.mock("@/lib/prisma", () => ({
  prisma: { $transaction: mocks.transaction },
}));

import { PATCH } from "@/app/(site)/api/admin/moderation/cases/[caseId]/route";

const request = (body: unknown) =>
  new Request("http://localhost/api/admin/moderation/cases/case-1", {
    method: "PATCH",
    headers: {
      Authorization: "Bearer admin-token",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

const context = { params: Promise.resolve({ caseId: "case-1" }) };

const pendingCase = {
  id: "case-1",
  profileId: "profile-1",
  targetType: "socialLink",
  targetId: "link-1",
  status: "preReviewPending",
  reviewMode: "preReview",
  snapshots: [
    {
      id: "snapshot-latest",
      content: {
        service: "youtube",
        url: "https://example.com/new",
        label: "YouTube",
      },
      contentHash: null,
    },
  ],
  profile: {
    status: "active",
    audioStatus: "active",
    displayName: "表示名",
    bio: "自己紹介",
    theme: "normal",
    audioKey: "audio/current.m4a",
    audioUrl: "",
    audioContentHash: "a".repeat(64),
    accountModerationStatus: "active",
  },
};

describe("PATCH /api/admin/moderation/cases/[caseId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorize.mockResolvedValue({
      ok: true,
      admin: { id: "admin-1", role: "admin" },
    });
    mocks.userRateLimit.mockReturnValue({
      allowed: true,
      retryAfterSeconds: 60,
    });
    mocks.ipRateLimit.mockReturnValue({
      allowed: true,
      retryAfterSeconds: 60,
    });
    mocks.getClientIp.mockReturnValue(null);
    mocks.caseFindUnique.mockResolvedValue(pendingCase);
    mocks.actionCreate.mockResolvedValue({ id: "action-1" });
    mocks.transaction.mockImplementation((callback) =>
      callback({
        moderationCase: {
          findUnique: mocks.caseFindUnique,
          update: mocks.caseUpdate,
        },
        moderationCaseEvent: { create: mocks.eventCreate },
        profile: { update: mocks.profileUpdate },
        socialLink: {
          findUnique: mocks.linkFindUnique,
          updateMany: mocks.linkUpdateMany,
        },
        moderationAction: { create: mocks.actionCreate },
        userNotification: { create: mocks.notificationCreate },
      }),
    );
    mocks.linkFindUnique.mockResolvedValue({
      service: "youtube",
      url: "https://example.com/new",
      label: "YouTube",
    });
  });

  it("事前確認の修正内容を承認して再公開する", async () => {
    const response = await PATCH(
      request({
        decision: "approve",
        reason: "修正を確認しました。",
        reviewedSnapshotId: "snapshot-latest",
      }),
      context,
    );

    expect(response.status).toBe(200);
    expect(mocks.linkUpdateMany).toHaveBeenCalledWith({
      where: { id: "link-1" },
      data: { status: "active" },
    });
    expect(mocks.caseUpdate).toHaveBeenCalledWith({
      where: { id: "case-1" },
      data: { status: "confirmed", resolvedAt: expect.any(Date) },
    });
    expect(mocks.eventCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventType: "reviewApproved",
        actorType: "admin",
        previousStatus: "preReviewPending",
        newStatus: "confirmed",
      }),
    });
    expect(mocks.notificationCreate).toHaveBeenCalled();
  });

  it("プロフィールの修正をケース審査から承認して再公開する", async () => {
    mocks.caseFindUnique.mockResolvedValueOnce({
      ...pendingCase,
      targetType: "profile",
      targetId: "profile-1",
      snapshots: [
        {
          id: "snapshot-profile",
          content: {
            displayName: "表示名",
            bio: "自己紹介",
            theme: "normal",
          },
          contentHash: null,
        },
      ],
      profile: { ...pendingCase.profile, status: "hidden" },
    });

    const response = await PATCH(
      request({
        decision: "approve",
        reason: "修正を確認しました。",
        reviewedSnapshotId: "snapshot-profile",
      }),
      context,
    );

    expect(response.status).toBe(200);
    expect(mocks.profileUpdate).toHaveBeenCalledWith({
      where: { id: "profile-1" },
      data: { status: "active" },
    });
    expect(mocks.caseUpdate).toHaveBeenCalledWith({
      where: { id: "case-1" },
      data: { status: "confirmed", resolvedAt: expect.any(Date) },
    });
    expect(mocks.actionCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: "restore", newStatus: "active" }),
      select: { id: true },
    });
    expect(mocks.notificationCreate).toHaveBeenCalledTimes(1);
  });

  it("利用停止中のケースを承認してもアカウント停止を解除しない", async () => {
    mocks.caseFindUnique.mockResolvedValueOnce({
      ...pendingCase,
      targetType: "profile",
      targetId: "profile-1",
      snapshots: [
        {
          id: "snapshot-profile",
          content: {
            displayName: "表示名",
            bio: "自己紹介",
            theme: "normal",
          },
          contentHash: null,
        },
      ],
      profile: {
        ...pendingCase.profile,
        status: "suspended",
        accountModerationStatus: "suspended",
      },
    });

    const response = await PATCH(
      request({
        decision: "approve",
        reason: "修正内容のみを確認しました。",
        reviewedSnapshotId: "snapshot-profile",
      }),
      context,
    );

    expect(response.status).toBe(200);
    expect(mocks.caseUpdate).toHaveBeenCalledWith({
      where: { id: "case-1" },
      data: { status: "confirmed", resolvedAt: expect.any(Date) },
    });
    expect(mocks.profileUpdate).toHaveBeenCalledWith({
      where: { id: "profile-1" },
      data: { status: "active" },
    });
    expect(mocks.profileUpdate).not.toHaveBeenCalledWith({
      where: { id: "profile-1" },
      data: expect.objectContaining({ accountModerationStatus: "active" }),
    });
  });

  it("音声の修正をケース審査から承認して再公開する", async () => {
    mocks.caseFindUnique.mockResolvedValueOnce({
      ...pendingCase,
      targetType: "audio",
      targetId: "profile-1",
      snapshots: [
        {
          id: "snapshot-audio",
          content: { audioKey: "audio/current.m4a" },
          contentHash: "a".repeat(64),
        },
      ],
      profile: { ...pendingCase.profile, audioStatus: "hidden" },
    });

    const response = await PATCH(
      request({
        decision: "approve",
        reason: "音声の修正を確認しました。",
        reviewedSnapshotId: "snapshot-audio",
      }),
      context,
    );

    expect(response.status).toBe(200);
    expect(mocks.profileUpdate).toHaveBeenCalledWith({
      where: { id: "profile-1" },
      data: { audioStatus: "active" },
    });
    expect(mocks.caseUpdate).toHaveBeenCalledWith({
      where: { id: "case-1" },
      data: { status: "confirmed", resolvedAt: expect.any(Date) },
    });
    expect(mocks.actionCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: "restore", newStatus: "active" }),
      select: { id: true },
    });
  });

  it("500文字の審査理由を通知本文として保存できる", async () => {
    const reason = "あ".repeat(500);

    const response = await PATCH(
      request({
        decision: "approve",
        reason,
        reviewedSnapshotId: "snapshot-latest",
      }),
      context,
    );

    expect(response.status).toBe(200);
    expect(mocks.actionCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ reason }),
      select: { id: true },
    });
    expect(mocks.notificationCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ message: reason }),
    });
  });

  it("501文字の審査理由はDB更新前に拒否する", async () => {
    const response = await PATCH(
      request({
        decision: "approve",
        reason: "あ".repeat(501),
        reviewedSnapshotId: "snapshot-latest",
      }),
      context,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "審査結果と500文字以内のユーザー向け理由を入力してください。",
    });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("審査トランザクションの書き込みに失敗した場合は成功を返さない", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.notificationCreate.mockRejectedValueOnce(new Error("write failed"));

    const response = await PATCH(
      request({
        decision: "approve",
        reason: "修正を確認しました。",
        reviewedSnapshotId: "snapshot-latest",
      }),
      context,
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "審査結果を保存できませんでした。",
    });
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
  });

  it("事前確認で追加修正を依頼して非公開を継続する", async () => {
    const response = await PATCH(
      request({
        decision: "requestChanges",
        reason: "リンク先をもう一度確認してください。",
      }),
      context,
    );

    expect(response.status).toBe(200);
    expect(mocks.linkUpdateMany).toHaveBeenCalledWith({
      where: { id: "link-1" },
      data: { status: "hidden" },
    });
    expect(mocks.caseUpdate).toHaveBeenCalledWith({
      where: { id: "case-1" },
      data: {
        status: "correctionRequired",
        resolvedAt: null,
        userMessage: "リンク先をもう一度確認してください。",
      },
    });
    expect(mocks.notificationCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ title: "追加の修正が必要です" }),
    });
  });

  it("旧事後確認ケースで問題が残っても対象だけを非公開にする", async () => {
    mocks.caseFindUnique.mockResolvedValueOnce({
      ...pendingCase,
      targetType: "audio",
      targetId: "profile-1",
      status: "postReviewPending",
      reviewMode: "postReview",
    });

    const response = await PATCH(
      request({
        decision: "continueHidden",
        reason: "不適切な音声が残っています。",
      }),
      context,
    );
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result.accountSuspended).toBe(false);
    expect(mocks.profileUpdate).toHaveBeenCalledWith({
      where: { id: "profile-1" },
      data: { audioStatus: "hidden" },
    });
    expect(mocks.actionCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: "hide" }),
      select: { id: true },
    });
  });

  it("削除済み対象の審査を完了して残存状態を解消する", async () => {
    mocks.caseFindUnique.mockResolvedValueOnce({
      ...pendingCase,
      targetType: "audio",
      targetId: "profile-1",
      status: "postReviewPending",
      reviewMode: "postReview",
      snapshots: [
        {
          id: "snapshot-deleted",
          content: { deleted: true },
          contentHash: null,
        },
      ],
      profile: {
        ...pendingCase.profile,
        audioStatus: "removed",
        audioKey: "",
        audioUrl: "",
        audioContentHash: null,
      },
    });

    const response = await PATCH(
      request({
        decision: "approve",
        reason: "削除を確認しました。",
        reviewedSnapshotId: "snapshot-deleted",
      }),
      context,
    );

    expect(response.status).toBe(200);
    expect(mocks.profileUpdate).not.toHaveBeenCalled();
    expect(mocks.actionCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "remove",
        previousStatus: "removed",
        newStatus: "removed",
      }),
      select: { id: true },
    });
  });

  it("審査待ちではないケースの重複処理を拒否する", async () => {
    mocks.caseFindUnique.mockResolvedValueOnce({
      ...pendingCase,
      status: "confirmed",
    });

    const response = await PATCH(
      request({
        decision: "approve",
        reason: "確認しました。",
        reviewedSnapshotId: "snapshot-latest",
      }),
      context,
    );

    expect(response.status).toBe(409);
    expect(mocks.caseUpdate).not.toHaveBeenCalled();
  });

  it("管理者が確認した後に最新版が変わっていた場合は承認を拒否する", async () => {
    const response = await PATCH(
      request({
        decision: "approve",
        reason: "修正を確認しました。",
        reviewedSnapshotId: "snapshot-old",
      }),
      context,
    );

    expect(response.status).toBe(409);
    expect(mocks.caseUpdate).not.toHaveBeenCalled();
    expect(mocks.linkUpdateMany).not.toHaveBeenCalled();
    expect(mocks.notificationCreate).not.toHaveBeenCalled();
  });

  it("確認したスナップショットIDがない承認リクエストを拒否する", async () => {
    const response = await PATCH(
      request({ decision: "approve", reason: "修正を確認しました。" }),
      context,
    );

    expect(response.status).toBe(400);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("最新スナップショットと現在のリンクが違う場合は承認を拒否する", async () => {
    mocks.linkFindUnique.mockResolvedValueOnce({
      service: "youtube",
      url: "https://example.com/changed-after-review",
      label: "YouTube",
    });

    const response = await PATCH(
      request({
        decision: "approve",
        reason: "修正を確認しました。",
        reviewedSnapshotId: "snapshot-latest",
      }),
      context,
    );

    expect(response.status).toBe(409);
    expect(mocks.caseUpdate).not.toHaveBeenCalled();
    expect(mocks.linkUpdateMany).not.toHaveBeenCalled();
  });

  it("最新スナップショットと現在の音声ハッシュが違う場合は承認を拒否する", async () => {
    mocks.caseFindUnique.mockResolvedValueOnce({
      ...pendingCase,
      targetType: "audio",
      targetId: "profile-1",
      snapshots: [
        {
          id: "snapshot-audio",
          content: { audioKey: "audio/reviewed.m4a" },
          contentHash: "b".repeat(64),
        },
      ],
    });

    const response = await PATCH(
      request({
        decision: "approve",
        reason: "音声を確認しました。",
        reviewedSnapshotId: "snapshot-audio",
      }),
      context,
    );

    expect(response.status).toBe(409);
    expect(mocks.caseUpdate).not.toHaveBeenCalled();
    expect(mocks.profileUpdate).not.toHaveBeenCalled();
  });
});
