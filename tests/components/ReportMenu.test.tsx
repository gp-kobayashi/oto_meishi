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
});
