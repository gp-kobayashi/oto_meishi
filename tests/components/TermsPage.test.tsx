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
});
