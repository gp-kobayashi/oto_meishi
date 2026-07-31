import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SupportPage from "@/app/(site)/support/page";

const { mocks } = vi.hoisted(() => ({
  mocks: { getSession: vi.fn() },
}));

vi.mock("@/lib/supabaseClient", () => ({
  supabase: { auth: { getSession: mocks.getSession } },
}));

describe("SupportPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({
      data: { session: { access_token: "user-token" } },
    });
  });

  it("利用停止中は期限と解除申請フォームを表示する", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      Response.json({
        eligibility: {
          kind: "accountAppeal",
          suspensionAppealDueAt: "2026-09-29T00:00:00.000Z",
        },
        requests: [],
      }),
    );

    render(<SupportPage />);

    expect(
      await screen.findByRole("heading", { name: "利用停止の解除申請" }),
    ).toBeDefined();
    expect(screen.getByText(/申請期限：/)).toBeDefined();
    expect(screen.getByLabelText("申請内容（必須）")).toBeDefined();
    expect(
      screen.getByRole<HTMLButtonElement>("button", { name: "申請を送信" })
        .disabled,
    ).toBe(true);
  });

  it("確認中の同種申請がある場合はフォームを表示しない", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      Response.json({
        eligibility: {
          kind: "inquiry",
          suspensionAppealDueAt: null,
        },
        requests: [
          {
            id: "request-1",
            kind: "inquiry",
            status: "pending",
            message: "確認したいです。",
            responseMessage: "",
            resolvedAt: null,
            createdAt: "2026-07-31T05:00:00.000Z",
            updatedAt: "2026-07-31T05:00:00.000Z",
          },
        ],
      }),
    );

    render(<SupportPage />);

    expect(
      await screen.findByText(
        "同じ種類の申請を確認中です。回答が届くまで重複して送信できません。",
      ),
    ).toBeDefined();
    expect(screen.queryByLabelText("申請内容（必須）")).toBeNull();
    expect(screen.getByText("確認中")).toBeDefined();
  });

  it("運営回答を申請履歴に表示する", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      Response.json({
        eligibility: { kind: "inquiry", suspensionAppealDueAt: null },
        requests: [
          {
            id: "request-1",
            kind: "inquiry",
            status: "resolved",
            message: "修正方法を教えてください。",
            responseMessage: "編集画面からリンクを変更してください。",
            resolvedAt: "2026-07-31T06:00:00.000Z",
            createdAt: "2026-07-31T05:00:00.000Z",
            updatedAt: "2026-07-31T06:00:00.000Z",
          },
        ],
      }),
    );

    render(<SupportPage />);

    expect(await screen.findByText("運営からの回答")).toBeDefined();
    expect(
      screen.getByText("編集画面からリンクを変更してください。"),
    ).toBeDefined();
  });

  it("送信上限時は再送可能までの時間を表示する", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock.mockResolvedValueOnce(
      Response.json({
        eligibility: { kind: "inquiry", suspensionAppealDueAt: null },
        requests: [],
      }),
    );
    fetchMock.mockResolvedValueOnce(
      Response.json(
        {
          error: "申請は1日5回までです。",
          retryAfterSeconds: 7200,
        },
        { status: 429 },
      ),
    );

    render(<SupportPage />);
    const textarea = await screen.findByLabelText("申請内容（必須）");
    fireEvent.change(textarea, { target: { value: "問い合わせ内容" } });
    fireEvent.click(screen.getByRole("button", { name: "申請を送信" }));

    expect(
      await screen.findByText("申請は1日5回までです。 約2時間後に再度送信できます。"),
    ).toBeDefined();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });
});
