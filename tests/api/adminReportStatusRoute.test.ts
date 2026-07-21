import { beforeEach, describe, expect, it, vi } from "vitest";

const { mocks } = vi.hoisted(() => ({
  mocks: {
    authorizeAdminRequest: vi.fn(),
    consumeAdminActionRateLimit: vi.fn(),
    consumeAdminActionIpRateLimit: vi.fn(),
    getClientIp: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
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
  prisma: {
    contentReport: { findUnique: mocks.findUnique, update: mocks.update },
  },
}));

import { PATCH } from "@/app/(site)/api/admin/reports/[reportId]/route";

const request = (body: unknown) =>
  new Request("http://localhost/api/admin/reports/report-1", {
    method: "PATCH",
    headers: {
      Authorization: "Bearer valid-token",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
const context = (reportId = "report-1") => ({
  params: Promise.resolve({ reportId }),
});

describe("PATCH /api/admin/reports/[reportId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorizeAdminRequest.mockResolvedValue({
      ok: true,
      admin: { id: "admin-1", authId: "auth-1", role: "admin" },
    });
    mocks.consumeAdminActionRateLimit.mockReturnValue({ allowed: true });
    mocks.consumeAdminActionIpRateLimit.mockReturnValue({ allowed: true });
    mocks.getClientIp.mockReturnValue("127.0.0.1");
    mocks.findUnique.mockResolvedValue({ id: "report-1", status: "pending" });
    mocks.update.mockResolvedValue({ id: "report-1" });
  });

  it("管理者が通報状態を変更できる", async () => {
    const response = await PATCH(request({ status: "reviewed" }), context());

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: "report-1" },
      data: { status: "reviewed" },
      select: { id: true },
    });
  });

  it("許可されていない状態は拒否する", async () => {
    const response = await PATCH(request({ status: "pending" }), context());

    expect(response.status).toBe(400);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("権限がなければDBへ問い合わせない", async () => {
    mocks.authorizeAdminRequest.mockResolvedValue({
      ok: false,
      response: Response.json({ error: "権限なし" }, { status: 403 }),
    });

    const response = await PATCH(request({ status: "resolved" }), context());

    expect(response.status).toBe(403);
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });
});
