import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import ReportMenu from "@/components/card/reportMenu/ReportMenu";

describe("ReportMenu", () => {
  it("三点ボタンを押すと通報するを表示する", () => {
    render(<ReportMenu />);

    const trigger = screen.getByRole("button", { name: "通報メニューを開く" });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("menuitem", { name: "通報する" })).toBeNull();

    fireEvent.click(trigger);

    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("menuitem", { name: "通報する" })).toBeDefined();
  });

  it("Escapeキーでメニューを閉じる", () => {
    render(<ReportMenu />);
    fireEvent.click(
      screen.getByRole("button", { name: "通報メニューを開く" }),
    );

    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("menuitem", { name: "通報する" })).toBeNull();
  });

  it("メニューの外側を押すと閉じる", () => {
    render(<ReportMenu />);
    fireEvent.click(
      screen.getByRole("button", { name: "通報メニューを開く" }),
    );

    fireEvent.pointerDown(document.body);

    expect(screen.queryByRole("menuitem", { name: "通報する" })).toBeNull();
  });

  it("通報するを押すと通報項目をオーバーレイ表示する", () => {
    render(<ReportMenu />);
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
    render(<ReportMenu />);
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
    render(<ReportMenu />);
    fireEvent.click(
      screen.getByRole("button", { name: "通報メニューを開く" }),
    );
    fireEvent.click(screen.getByRole("menuitem", { name: "通報する" }));

    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
