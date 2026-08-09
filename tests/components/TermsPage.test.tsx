import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import TermsPage from "@/app/(site)/terms/page";

describe("TermsPage", () => {
  it("サービス利用に必要な項目を表示する", () => {
    render(<TermsPage />);

    expect(screen.getByRole("heading", { level: 1, name: "利用規約" })).toBeDefined();
    expect(screen.getByRole("heading", { name: "掲載する内容について" })).toBeDefined();
    expect(screen.getByRole("heading", { name: "禁止していること" })).toBeDefined();
    expect(screen.getByRole("heading", { name: "コンテンツの取り扱い" })).toBeDefined();
    expect(screen.getByRole("heading", { name: "データの保管" })).toBeDefined();
  });

  it("ヘルプと登録ページへの導線を表示する", () => {
    render(<TermsPage />);

    expect(screen.getByRole("link", { name: "使い方を見る" }).getAttribute("href")).toBe("/help");
    expect(screen.getByRole("link", { name: "アカウント登録へ" }).getAttribute("href")).toBe("/signup");
  });

  it("他人主体のプロフィールと政治・宗教に関する禁止範囲を表示する", () => {
    render(<TermsPage />);

    expect(
      screen.getByText(
        "アカウントを利用する本人以外の人物を主体としたプロフィールを作成すること",
      ),
    ).toBeDefined();
    expect(
      screen.getByText("政党・政治団体・宗教団体への勧誘または宣伝を行うこと"),
    ).toBeDefined();
    expect(
      screen.getByText(
        "他の宗教、政党またはその支持者を攻撃したり、誹謗中傷したりすること",
      ),
    ).toBeDefined();
    expect(
      screen.getByText(/個人として政治・宗教上の所属や信条を紹介することは禁止しません/),
    ).toBeDefined();
  });
});
