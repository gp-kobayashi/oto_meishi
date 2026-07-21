import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ReportMenu from "@/components/card/reportMenu/ReportMenu";

describe("ReportMenu", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("三点ボタンを押すと通報するを表示する", () => {
    render(<ReportMenu profileId="profile-1" />);

    const trigger = screen.getByRole("button", { name: "通報メニューを開く" });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("menuitem", { name: "通報する" })).toBeNull();

    fireEvent.click(trigger);

    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("menuitem", { name: "通報する" })).toBeDefined();
  });

  it("Escapeキーでメニューを閉じる", () => {
    render(<ReportMenu profileId="profile-1" />);
    fireEvent.click(
      screen.getByRole("button", { name: "通報メニューを開く" }),
    );

    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("menuitem", { name: "通報する" })).toBeNull();
  });

  it("メニューの外側を押すと閉じる", () => {
    render(<ReportMenu profileId="profile-1" />);
    fireEvent.click(
      screen.getByRole("button", { name: "通報メニューを開く" }),
    );

    fireEvent.pointerDown(document.body);

    expect(screen.queryByRole("menuitem", { name: "通報する" })).toBeNull();
  });

  it("通報するを押すと通報項目をオーバーレイ表示する", () => {
    render(<ReportMenu profileId="profile-1" />);
    fireEvent.click(
      screen.getByRole("button", { name: "通報メニューを開く" }),
    );

    fireEvent.click(screen.getByRole("menuitem", { name: "通報する" }));

    expect(
      screen.getByRole("dialog", { name: "このmeishiを通報" }),
    ).toBeDefined();
    expect(screen.getByRole("radio", { name: "不適切な音声" })).toBeDefined();
    expect(
      screen.getByRole("radio", { name: "誹謗中傷・嫌がらせ" }),
    ).toBeDefined();
    expect(
      screen.getByRole("radio", { name: "危険または不正なリンク" }),
    ).toBeDefined();
  });

  it("通報項目を選択でき、キャンセルで閉じる", () => {
    render(<ReportMenu profileId="profile-1" />);
    fireEvent.click(
      screen.getByRole("button", { name: "通報メニューを開く" }),
    );
    fireEvent.click(screen.getByRole("menuitem", { name: "通報する" }));
    const reason = screen.getByRole("radio", { name: "なりすまし" });

    fireEvent.click(reason);
    expect((reason as HTMLInputElement).checked).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "キャンセル" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("オーバーレイはEscapeキーで閉じる", () => {
    render(<ReportMenu profileId="profile-1" />);
    fireEvent.click(
      screen.getByRole("button", { name: "通報メニューを開く" }),
    );
    fireEvent.click(screen.getByRole("menuitem", { name: "通報する" }));

    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("選択した理由と詳細を通報APIへ送信する", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ success: true }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }),
    );
    render(<ReportMenu profileId="profile-1" />);
    fireEvent.click(
      screen.getByRole("button", { name: "通報メニューを開く" }),
    );
    fireEvent.click(screen.getByRole("menuitem", { name: "通報する" }));

    fireEvent.click(screen.getByRole("radio", { name: "危険または不正なリンク" }));
    fireEvent.change(screen.getByRole("textbox", { name: "詳細（任意）" }), {
      target: { value: "外部サイトへ誘導されます" },
    });
    fireEvent.click(screen.getByRole("button", { name: "送信する" }));

    expect(await screen.findByText("通報を受け付けました")).toBeDefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/api/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        profileId: "profile-1",
        reason: "unsafe_link",
        details: "外部サイトへ誘導されます",
      }),
    });
  });

  it("APIが拒否した場合は理由を表示して再送信できる", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "送信回数が上限に達しました。" }), {
        status: 429,
        headers: { "Content-Type": "application/json" },
      }),
    );
    render(<ReportMenu profileId="profile-1" />);
    fireEvent.click(
      screen.getByRole("button", { name: "通報メニューを開く" }),
    );
    fireEvent.click(screen.getByRole("menuitem", { name: "通報する" }));
    fireEvent.click(screen.getByRole("radio", { name: "その他" }));
    fireEvent.click(screen.getByRole("button", { name: "送信する" }));

    expect((await screen.findByRole("alert")).textContent).toContain(
      "送信回数が上限に達しました。",
    );
    expect(
      (screen.getByRole("button", { name: "送信する" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
  });
});
