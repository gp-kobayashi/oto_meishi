import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import NotFound, { metadata } from "@/app/not-found";

describe("NotFound", () => {
  it("利用者向けの404案内とトップページへの導線を表示すること", () => {
    render(<NotFound />);

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
    expect(screen.queryByText(/localhost|path|digest|error/i)).toBeNull();
  });

  it("検索結果に登録しないメタデータを明示すること", () => {
    expect(metadata.title).toBe("ページが見つかりません | oto_meishi");
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });
});
