import { beforeEach, describe, expect, it, vi } from "vitest";

const { mocks } = vi.hoisted(() => ({
  mocks: {
    authorizeAdminRequest: vi.fn(),
    consumeAdminActionRateLimit: vi.fn(),
    consumeAdminActionIpRateLimit: vi.fn(),
    getClientIp: vi.fn(),
    transaction: vi.fn(),
    queryRawUnsafe: vi.fn(),
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
  },
}));

vi.mock("@/lib/adminAuth", () => ({
  authorizeAdminRequest: mocks.authorizeAdminRequest,
}));
vi.mock("@/lib/adminActionRateLimit", () => ({
  consumeAdminActionRateLimit: mocks.consumeAdminActionRateLimit,
  consumeAdminActionIpRateLimit: mocks.consumeAdminActionIpRateLimit,
}));
vi.mock("@/lib/clientIp", () => ({ getClientIp: mocks.getClientIp }));
vi.mock("@/lib/prisma", () => ({
  prisma: { $transaction: mocks.transaction },
}));

import { PATCH } from "@/app/(site)/api/admin/moderation/violations/[violationId]/route";

const request = (note: unknown = "SNS投稿で本人と確認しました。") =>
  new Request("http://localhost/api/admin/moderation/violations/violation-1", {
    method: "PATCH",
    headers: {
      Authorization: "Bearer admin-token",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ note }),
  });

const context = (violationId = "violation-1") => ({
  params: Promise.resolve({ violationId }),
});

describe("PATCH /api/admin/moderation/violations/[violationId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorizeAdminRequest.mockResolvedValue({
      ok: true,
      admin: { id: "admin-1", authId: "auth-1", role: "admin" },
    });
    mocks.consumeAdminActionRateLimit.mockReturnValue({ allowed: true });
    mocks.consumeAdminActionIpRateLimit.mockReturnValue({ allowed: true });
    mocks.getClientIp.mockReturnValue(null);
    mocks.queryRawUnsafe.mockResolvedValue([{ pg_advisory_xact_lock: null }]);
    mocks.findUnique.mockResolvedValue({
      id: "violation-1",
      profileId: "profile-1",
      moderationCaseId: "case-1",
      eventType: "confirmed",
      reasonCode: "impersonation",
    });
    mocks.findFirst.mockResolvedValue(null);
    mocks.create.mockResolvedValue({ id: "revocation-1" });
    mocks.transaction.mockImplementation((callback) =>
      callback({
        $queryRawUnsafe: mocks.queryRawUnsafe,
        moderationViolationEvent: {
          findUnique: mocks.findUnique,
          findFirst: mocks.findFirst,
          create: mocks.create,
        },
      }),
    );
  });

  it("なりすまし違反の取り消しイベントを追加する", async () => {
    const response = await PATCH(request(), context());

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(mocks.create).toHaveBeenCalledWith({
      data: {
        profileId: "profile-1",
        moderationCaseId: "case-1",
        adminUserId: "admin-1",
        adminAuthId: "auth-1",
        adminRole: "admin",
        eventType: "revoked",
        reasonCode: "impersonation",
        originalViolationEventId: "violation-1",
        suspensionTriggered: false,
        note: "SNS投稿で本人と確認しました。",
      },
      select: { id: true },
    });
  });

  it("取り消し済みの違反を再度取り消さない", async () => {
    mocks.findFirst.mockResolvedValue({ id: "revocation-1" });

    const response = await PATCH(request(), context());

    expect(response.status).toBe(409);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("なりすまし以外の違反回数は本人確認で取り消さない", async () => {
    mocks.findUnique.mockResolvedValue({
      id: "violation-1",
      profileId: "profile-1",
      moderationCaseId: "case-1",
      eventType: "confirmed",
      reasonCode: "unsafeLink",
    });

    const response = await PATCH(request(), context());

    expect(response.status).toBe(409);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("取り消し理由が空の場合は拒否する", async () => {
    const response = await PATCH(request(" "), context());

    expect(response.status).toBe(400);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("管理者でない場合はDBへ問い合わせない", async () => {
    mocks.authorizeAdminRequest.mockResolvedValue({
      ok: false,
      response: Response.json({ error: "権限なし" }, { status: 403 }),
    });

    const response = await PATCH(request(), context());

    expect(response.status).toBe(403);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
