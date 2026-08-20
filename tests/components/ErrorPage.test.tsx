import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ErrorPage from "@/components/error/ErrorPage";

describe("ErrorPage", () => {
  it("サービス名、見出し、説明、トップページへのリンクを表示すること", () => {
    render(
      <ErrorPage
        heading="ページが見つかりません"
        description="お探しのページは存在しないか、移動した可能性があります。"
      />,
    );

    expect(screen.getByText("oto_meishi")).toBeDefined();
    expect(
      screen.getByRole("heading", { name: "ページが見つかりません" }),
    ).toBeDefined();
    expect(
      screen.getByText(
        "お探しのページは存在しないか、移動した可能性があります。",
      ),
    ).toBeDefined();
    expect(
      screen
        .getByRole("link", { name: "トップページへ戻る" })
        .getAttribute("href"),
    ).toBe("/");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("retryが渡された場合だけ再試行ボタンを表示して呼び出すこと", () => {
    const retry = vi.fn();
    render(
      <ErrorPage
        heading="問題が発生しました"
        description="時間をおいてから、もう一度お試しください。"
        retry={retry}
      />,
    );

    const button = screen.getByRole("button", { name: "もう一度試す" });
    fireEvent.click(button);
    expect(retry).toHaveBeenCalledOnce();
  });
});
