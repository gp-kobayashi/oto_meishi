import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import HelpPage from "@/app/(site)/help/page";

describe("HelpPage", () => {
  it("登録からmeishi共有までの案内を表示する", () => {
    render(<HelpPage />);

    expect(screen.getByRole("heading", { level: 1, name: "ヘルプ" })).toBeDefined();
    expect(screen.getByRole("heading", { name: "登録から編集まで" })).toBeDefined();
    expect(screen.getByRole("heading", { name: "編集画面の説明" })).toBeDefined();
    expect(screen.getByRole("heading", { name: "音声ファイル" })).toBeDefined();
    expect(screen.getByRole("heading", { name: "QRコード" })).toBeDefined();
  });

  it("登録ページとマイページへの導線を表示する", () => {
    render(<HelpPage />);

    expect(
      screen.getAllByRole("link", { name: /アカウント登録/ })[0].getAttribute("href"),
    ).toBe("/signup");
    expect(
      screen.getByRole("link", { name: "マイページへ" }).getAttribute("href"),
    ).toBe("/profile");
  });

  it("共通設定の公開URLを例として表示する", () => {
    render(<HelpPage />);

    expect(
      screen.getByText("https://oto-meishi.com/user_id1234"),
    ).toBeDefined();
  });
});
